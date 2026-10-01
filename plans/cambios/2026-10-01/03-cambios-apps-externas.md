# Guía de actualización para aplicaciones externas

> Fecha: 2026-10-01
> Cambios que deben implementar las apps que consumen `auth-ms` (backends por TCP y frontends por REST).

---

## 0. Resumen de cambios que impactan a las apps
1. **JWT con `iss`/`aud`:** los tokens ahora traen `issuer` y `audience`; **firma HS256**. Si verifican el JWT localmente, deben aceptar los nuevos claims (no rompen la firma) y pueden validarlos.
2. **Revocación de sesiones:** `validateUser` (TCP) ahora **rechaza tokens revocados o sin `sid`**. Nuevo `validateSession` (booleano).
3. **Rotación de refresh:** `/auth/refresh` devuelve un **`refreshToken` nuevo**; hay que **guardar el nuevo** y descartar el anterior (reutilizar el viejo revoca la sesión).
4. **Tenant en TCP:** el backend del microservicio deriva el tenant del `payload` (`company`/`tenantId` o `user.company/tenantId`). Enviar el tenant correcto en cada comando.
5. **Rate limiting TCP:** posibles respuestas 429 por comando; implementar backoff/reintentos controlados.
6. **Verificación de correo:** enlace de un solo uso a `…/verify-email?token=…`; reenvío vía `POST /api/auth/resend-verification`.
7. **Recovery:** ya **no** envía contraseña temporal; envía **enlace** a `…/set-password?token=…`.
8. **CORS:** los frontends deben estar en `SSO_ALLOWED_ORIGINS`.
9. **Errores:** respuestas 500 genéricas con `requestId`; duplicados 409 con mensaje amigable.
10. **Params REST:** `:id`/`:userId` deben ser ObjectId válido; `:key`/`:tenantId` con patrón seguro (400 si no).
11. **URL de enlaces de correo:** se toma del **origen real de la petición** (`Origin`/`Referer`). Las apps externas deben enviar `Origin` (o `redirectUri`) para que invitación/bienvenida/recuperación/verificación apunten a **su** front. Ya no se usa `APP_URL` de entorno.

---

## 1. Apps BACKEND (consumidoras TCP)

### 1.1 Configuración base
- Asegurar `SERVICE_API_KEY` idéntica a la de `auth-ms`.
- `ClientProxy` TCP al host/puerto de `auth-ms` (`MICROSERVICE_PORT`, def. 3011). Si se habilita TLS/mTLS, configurar `tls` en el `ClientProxy`.
- Todos los payloads deben incluir `serviceKey` (obligatorio).

### 1.2 Validación de sesión en cada request
Reemplazar/asegurar la validación por `validateUser`:
```ts
const { user } = await firstValueFrom(
  client.send({ cmd: 'validateUser' }, { serviceKey, token }),
);
```
- Si responde **error/401** (`Sesión revocada o expirada`, `Sesión no válida`, `Token inválido`): forzar **logout** en la app.
- Para chequear solo vigencia (sin traer usuario):
```ts
const { active } = await firstValueFrom(
  client.send({ cmd: 'validateSession' }, { serviceKey, token }),
);
```
- **No cachear** el resultado de autenticación (o TTL muy corto, ≤30s) para que la revocación sea inmediata.

### 1.3 Refresh token (rotación)
Al refrescar:
```ts
const res = await firstValueFrom(
  client.send({ cmd: 'refresh' }, { serviceKey, refreshToken }),
);
// res.accessToken (nuevo access) y res.refreshToken (NUEVO refresh)
```
- **Guardar `res.refreshToken`** y reemplazar el anterior. Si la app solo guarda el access, seguirá usando el refresh viejo → al reutilizarlo el servidor **revoca todas las sesiones**.
- Manejar fallo de refresh → logout.

### 1.4 Tenant en los comandos de usuarios
Enviar el tenant en el payload, p. ej.:
```ts
client.send({ cmd: 'findUserById' }, { serviceKey, id, company, tenantId });
// o anidado:
client.send({ cmd: 'findAllUsers' }, { serviceKey, user: { company, tenantId } });
```
- El microservicio fija el contexto con ese tenant; operaciones por id quedan acotadas a esa empresa.
- `createExternalUser`: `company` **obligatoria**; `_id` opcional (ObjectId válido).
- Mutaciones de roles/permisos/módulos/empresas por TCP siguen permitidas (confiando en la app), pero idealmente usarlas desde backends confiables.

### 1.5 Manejo de errores y límites
- **401**: sesión/token inválido o revocado → logout.
- **429**: excedió el rate limit TCP (`login` 5/min, etc.) → backoff y reintento controlado.
- **400**: parámetros inválidos (ids), payload mal formado.
- **409**: duplicados (email/usuario/teléfono).

### 1.6 Comandos disponibles (referencia)
- **auth**: `login`, `validateUser`, `validateSession`, `refresh`, `changePassword`.
- **users**: `createExternalUser`, `createUser`, `findAllUsers`, `findUsersByTenant`, `findUsersByPagination`, `findUserById`, `getUserProfile`, `findUsersByDate`, `updateUser`, `removeUser`, `softRemoveUser`, `hardRemoveUser`.
- **roles/permissions/modules/companies/tenant-config**: ver catálogo en `GET /api/tcp-docs`.

---

## 2. Apps FRONTEND (consumidoras REST)

### 2.1 Login y almacenamiento de tokens
- Guardar `accessToken` y `refreshToken` devueltos por `/api/auth/login`.
- El access token incluye `emailVerified`; usarlo para mostrar/ocultar el banner de verificación.

### 2.2 Refresh (rotación) — obligatorio actualizar
- Al llamar a `/api/auth/refresh`, **guardar también `refreshToken`** de la respuesta:
```ts
const res = await http.post('/api/auth/refresh', { refreshToken });
saveTokens(res.accessToken, res.refreshToken); // reemplazar el refresh previo
```
- Si no se actualiza el refresh, el siguiente refresh disparará la **revocación por reuso**.

### 2.3 Verificación de correo
- Nueva ruta/página **`/verify-email`** que lea `?token=` y llame `POST /api/auth/verify-email`.
- Botón **“Reenviar verificación”** (usuario autenticado) → `POST /api/auth/resend-verification`.
- Banner (franja) si `emailVerified === false`.

### 2.4 Recovery (sin contraseña temporal)
- `POST /api/auth/recovery-password`: respuesta **genérica** (no revela existencia). El usuario recibe **enlace** a `…/set-password?token=…`.
- La pantalla `/set-password` debe existir y consumir `POST /api/auth/set-password-token` (sirve para invitación y recovery).

### 2.5 CORS
- El dominio del frontend debe estar en `SSO_ALLOWED_ORIGINS` (allowlist de CORS). Sin él, el navegador bloqueará las llamadas.

### 2.6 Manejo de errores
- 401 → cerrar sesión y redirigir a login.
- 429 → mensaje de “demasiadas solicitudes”.
- 500 → mostrar mensaje genérico; incluir `requestId` en logs/reportes de soporte.

---

## 3. Checklist por app
- [ ] `SERVICE_API_KEY` configurada y TLS del `ClientProxy` (si aplica).
- [ ] `validateUser` en cada request (o `validateSession`), sin cachear autenticación.
- [ ] Refresh guarda el **nuevo** `refreshToken`.
- [ ] Enviar `company`/`tenantId` en comandos de usuarios.
- [ ] Manejo de 401/429/400/409.
- [ ] Frontend: guarda refresh rotado, ruta `/verify-email`, banner + reenviar, recovery por enlace.
- [ ] Frontend: origen en `SSO_ALLOWED_ORIGINS`.
- [ ] (Opcional) validar `iss`/`aud` del JWT si se verifica localmente.
