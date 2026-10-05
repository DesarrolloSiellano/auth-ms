# Estrategia global de validación de tokens e integración (auth-ms)

> Fecha: 2026-10-05
> Documento canónico y **vigente** para **todas las aplicaciones externas** que
> consumen `auth-ms` (por REST y/o TCP). Describe el **contrato real** de las
> transacciones y la **estrategia recomendada** para no sobrecargar `auth-ms`.

---

## 1. Arquitectura de integración
- `auth-ms` es la **autoridad de identidad** (usuarios, sesiones, roles,
  permisos, módulos, empresas, políticas por tenant).
- Dos canales:
  - **REST** (`/auth/api/...`): para frontends (JWT) y consultas de servicio
    (`x-service-key` en rutas opt-in).
  - **TCP** (`@MessagePattern`): para backends. **Todo payload debe incluir
    `serviceKey`.**
- La **identidad** viaja en un JWT **ligero** (sin roles/permisos/módulos).

## 2. Contrato de respuesta (REAL)

### 2.1 REST
Envelope estándar:
```json
{ "message": "...", "statusCode": 200, "status": "Success", "data": {...}, "meta": {...} }
```
Error:
```json
{ "message": "...", "statusCode": 401, "status": "Error", "data": null,
  "code?": "...", "errors?": [...], "requestId": "uuid",
  "meta": { "timestamp": "...", "path": "/api/..." } }
```

### 2.2 TCP
Las respuestas **también se envuelven** (no hay `statusCode` en RPC):
```json
{ "message": "...", "status": "Success", "data": {...}, "meta": {...} }
```
- **El payload real va SIEMPRE en `data`.**
- Error (RPC):
  ```json
  { "message": "...", "status": "Error", "data": null,
    "code?": "...", "errors?": [...], "requestId": "uuid",
    "meta": { "timestamp": "..." } }
  ```
- **Regla para apps:** tratar como error si `status === 'Error'` o si la
  promesa del `ClientProxy` rechaza.

## 3. Comandos de `auth` (payload y respuesta real)

| cmd | Payload | Respuesta (`data`) |
|---|---|---|
| `login` | `{ serviceKey, email, password, meta?, ip? }` | `{ meta: { payload, accessToken, refreshToken, mustChangePassword, tenantConfig? }, ... }` |
| `validateUser` | `{ serviceKey, token }` | `{ user }` → **acceso: `data.user`** |
| `validateSession` | `{ serviceKey, token }` | `{ active, valid, reason? }` → **acceso: `data.active`** |
| `refresh` | `{ serviceKey, refreshToken }` | `{ accessToken, refreshToken, payload }` (rota refresh) |
| `changePassword` | `{ serviceKey, id?, currentPassword, newPassword }` | confirmación |

> **Importante:** `validateUser` devuelve el usuario en `data.user` (no en la
> raíz). `validateSession` devuelve `data.active` (booleano, sin lookup de
> usuario).

## 4. Estrategia global de validación (dos capas) — OBLIGATORIA

Objetivo: revocación efectiva **sin** sobrecargar `auth-ms`.

### Capa 1 — Validación local (sin red, fast-path)
En cada request, la app verifica el access token **localmente**:
- Firma `HS256`, `iss` (`JWT_ISSUER`), `aud` (`JWT_AUDIENCE`), `exp`.
- Extrae la identidad de los claims (`_id`, `email`, `company`, `tenantId`,
  `isAdmin`, `isSuperAdmin`, `isActived`, `emailVerified`, `sid`).
- Requiere `JWT_SECRET` (y `JWT_ISSUER`/`JWT_AUDIENCE`) en la app.

### Capa 2 — Revocación remota (autoritativa, cacheada)
- Llamar a **`validateSession`** (ligero: firma + `sid` + sesión activa; **no**
  hace lookup de usuario).
- **Cachear el resultado** por sesión (`sid`) con TTL corto (**15s** por
  defecto; configurable `AUTH_VALIDATION_TTL_MS`).
- Si `data.active === false` o la llamada falla ⇒ **logout**.
- **`validateUser`** solo en **login/bootstrap** (cuando se necesita el usuario
  completo o roles/permisos), nunca por request.

### Política de fallo
- Caché vigente ⇒ permitir.
- Caché vencida y `auth-ms` inaccesible ⇒ **fail-closed** (rechazar el request)
  y registrar métrica/log.

### Manejo de errores
- **401** (`Sesión revocada o expirada`, `Sesión no válida`, `Token inválido`,
  `SESSION_EXPIRED`) ⇒ **cerrar sesión** y redirigir a login.
- **429** ⇒ backoff y reintento controlado.
- **400/409** ⇒ error de datos (no cerrar sesión).

## 5. Ejemplo de guard (NestJS, TCP + caché)

```ts
@Injectable()
export class AuthValidationService {
  private readonly cache = new Map<string, { active: boolean; expiresAt: number }>();
  private readonly ttlMs = Number(process.env.AUTH_VALIDATION_TTL_MS ?? 15000);

  constructor(
    @Inject('USER_SERVICE') private readonly authClient: ClientProxy,
    private readonly config: ConfigService,
    private readonly jwt: JwtService, // verificación LOCAL
  ) {}

  /** Identidad local (sin red) + revocación remota cacheada. */
  async validate(token: string) {
    // 1) Validación local
    const claims = this.jwt.verify(token, {
      secret: this.config.getOrThrow('JWT_SECRET'),
      algorithms: ['HS256'],
      issuer: this.config.get('JWT_ISSUER', 'bponet-auth'),
      audience: this.config.get('JWT_AUDIENCE', 'bponet-apps'),
    }) as any;
    if (!claims?.sid) throw new UnauthorizedException('Sesión no válida');

    // 2) Revocación remota con caché
    const cached = this.cache.get(claims.sid);
    const fresh = cached && cached.expiresAt > Date.now();
    let active = fresh ? cached!.active : undefined as unknown as boolean;
    if (!fresh) {
      const res = await firstValueFrom(
        this.authClient.send({ cmd: 'validateSession' },
          { serviceKey: this.config.getOrThrow('SERVICE_API_KEY'), token }),
      );
      active = !!(res?.data?.active);
      this.cache.set(claims.sid, { active, expiresAt: Date.now() + this.ttlMs });
    }
    if (!active) throw new UnauthorizedException('Sesión revocada o expirada');
    return claims; // identidad (autorización desde claims/perfil cacheado)
  }
}
```

## 6. Refresh token (rotación)
- `POST /api/auth/refresh` (REST) y `cmd: 'refresh'` (TCP) devuelven **un
  `refreshToken` NUEVO**.
- **Guardar siempre el nuevo** y descartar el anterior. Reutilizar uno ya
  rotado ⇒ auth-ms **revoca todas las sesiones** del usuario.
- Ante fallo de refresh ⇒ logout.

## 7. Tenant en comandos TCP de datos
- Enviar `company` / `tenantId` (o `user.company`/`user.tenantId`) en el payload.
- **No** existe el campo `context`; el tenant se toma de esos campos.
- Esto acota las operaciones por id a la empresa del usuario.

## 8. Variables de entorno

### auth-ms (servidor)
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`,
  `JWT_ACCESS_EXPIRATION`, `JWT_REFRESH_EXPIRATION`.
- `SERVICE_API_KEY` (obligatoria).
- `SSO_ALLOWED_ORIGINS` (allowlist SSO y CORS).
- `SESSION_CACHE_TTL_MS`, `JWT_USER_CACHE_TTL_MS`.
- `RPC_THROTTLE_ENABLED`, `RPC_THROTTLE_LOGIN`, `RPC_THROTTLE_REFRESH`,
  `RPC_THROTTLE_CHANGE_PASSWORD`, `RPC_THROTTLE_VALIDATE`,
  `RPC_THROTTLE_DEFAULT`.
- `TLS_ENABLED`, `TLS_MUTUAL`, `TLS_KEY_PATH`, `TLS_CERT_PATH`, `TLS_CA_PATH`.

### App externa (cliente)
- `SERVICE_API_KEY` (idéntica a auth-ms).
- `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE` (para validación local).
- Host/puerto TCP (`USER_MS_HOST`/`USER_MS_PORT`).
- `AUTH_VALIDATION_TTL_MS` (caché de revocación; 15s por defecto).

## 9. Límites TCP (rate limiting)
Ventana 60s, por comando y emisor (`serviceKey`):
- `login`: 5 · `refresh`: 10 · `changePassword`: 10.
- `validateUser` / `validateSession`: **6000**.
- resto: 100.
- Todos configurables (`RPC_THROTTLE_*`). Por instancia (Redis para multi-instancia).

## 10. Checklist de integración para apps externas
- [ ] `SERVICE_API_KEY` configurada; TLS del `ClientProxy` si aplica.
- [ ] Validación **local** del JWT (firma/`iss`/`aud`/`exp`).
- [ ] Revocación vía **`validateSession`** con **caché 15s** (logout si `active=false`).
- [ ] **`validateUser`** solo en login/bootstrap (acceder `data.user`).
- [ ] Guardar el **nuevo `refreshToken`** en cada refresh.
- [ ] Enviar `company`/`tenantId` en comandos de datos (no `context`).
- [ ] Manejar 401 (logout) y 429 (backoff).
- [ ] `syncAgent`/sincronizaciones pesadas: **solo en login**, no por request.
- [ ] Origen del frontend en `SSO_ALLOWED_ORIGINS` (CORS).

## 11. Notas
- Las respuestas TCP **siempre** se envuelven; leer el dato desde `data`.
- No cachear la *identidad* de forma prolongada; la *revocación* sí (TTL corto).
- Los enlaces de correo (invitación/bienvenida/recuperación/verificación) usan
  el **origen real de la petición**; verificación y recuperación son por
  **enlace de un solo uso**.
