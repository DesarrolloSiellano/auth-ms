# Estrategia de Seguridad en la Comunicación entre Microservicios

> Documento vivo que registra la estrategia de seguridad para la comunicación del microservicio `auth-ms`
> con sus consumidores (frontends y otros backends), especialmente cuando estos **no están alojados
> en el mismo servidor** y el tráfico cruza redes (posiblemente internet público).

---

## 1. Contexto y premisas

- `auth-ms` es el **límite de seguridad** del ecosistema: firma JWTs, maneja contraseñas, credenciales y el árbol de autorización.
- Expone **dos canales** para las mismas operaciones:
  - **REST/HTTPS** (`/api/...`) — consumido por frontends (navegadores) a través de nginx.
  - **TCP** (`Transport.TCP`, puerto `MICROSERVICE_PORT`, por defecto `3011`) — consumido por otros microservicios vía `@MessagePattern`.
- **Topología:** en varios casos los clientes TCP/REST del microservicio **no están en el mismo servidor**, por lo que el tráfico puede cruzar internet público.
- **Regla de oro asumida:** no confiar en que el tráfico interno sea seguro; **cifrar y autenticar** en todas las capas.

### ¿El TLS de nginx es suficiente?

**No.** El TLS de nginx termina únicamente el tramo **HTTP/HTTPS** del canal REST (cliente → nginx). La comunicación **TCP directa** entre microservicios (puerto 3011) es un socket socket-a-socket que **no pasa por nginx** y queda **en claro**. Por eso el canal TCP necesita su propia estrategia de cifrado y autenticación.

---

## 2. Estrategia general (defense-in-depth)

| Fase | Capa | Qué resuelve | Estado |
|------|------|--------------|--------|
| F1 | Autenticación de servicio (secreto compartido) | "¿Quién tiene derecho a llamarme?" en el canal TCP (y REST opt-in) | Implementada |
| F2 | Cifrado del canal TCP (TLS / mTLS) | "¿El tráfico es legible/interceptable?" | Implementada (configurable) |
| F3 | Canal REST reforzado (JWT **o** clave de servicio) | "¿Los servicios pueden consumir REST sin impersonar usuarios?" | Implementada (opt-in por ruta) |
| F4 | Higiene de red / firewall | Exposición del puerto y topología | Pendiente (operaciones) |

---

## 3. F1 — Autenticación de servicio (secreto compartido)

**Problema:** el puerto TCP 3011 no exigía ninguna autenticación; cualquiera que alcance el puerto podía invocar `@MessagePattern`.

**Solución:**
- Variable de entorno **`SERVICE_API_KEY`** (obligatoria, fail-fast en `env.validation.ts`).
- Guard global **`ServiceAuthGuard`** (`src/core/guards/service-auth.guard.ts`) registrado como `APP_GUARD`:
  - **Contexto RPC (TCP):** exige `serviceKey` en el payload de **todos** los `@MessagePattern`. Comparación en tiempo constante (`crypto.timingSafeEqual`).
  - **Contexto HTTP:** no-op salvo que la ruta esté marcada con el decorador **`@ServiceRoute()`** (ver F3).
- **Contrato para clientes TCP:** toda llamada debe incluir `serviceKey` en el payload:
  ```json
  { "serviceKey": "clave-compartida", "...payloadOriginal": "..." }
  ```
- **Nota de ruptura:** los handlers que recibían primitivas (`id: string`, `token: string`) ahora aceptan objeto `{ serviceKey, id/token, ... }` para poder transportar la clave. **Todos los clientes TCP deben actualizarse.**

### Handlers TCP protegidos (todos)

`auth`, `users`, `modules`, `permissions`, `roles`, `companies`.

---

## 4. F2 — Cifrado del canal TCP (TLS / mTLS)

**Problema:** el tráfico TCP viaja en claro por la red; si cruza internet, puede ser interceptado (tokens, contraseñas, payloads).

**Solución (configurable por entorno):**

| Variable | Descripción | Default |
|----------|-------------|---------|
| `TLS_ENABLED` | Activa TLS en `Transport.TCP` | `false` |
| `TLS_KEY_PATH` | Ruta a la clave privada del servidor | — |
| `TLS_CERT_PATH` | Ruta al certificado del servidor | — |
| `TLS_CA_PATH` | Ruta a la CA (requerida para mTLS) | — |
| `TLS_MUTUAL` | Activa **mTLS** (`requestCert` + `rejectUnauthorized`) | `false` |

- Configuración en `main.ts` (`app.connectMicroservice`), pasando `options.tls`.
- **Producción recomendada:** `TLS_ENABLED=true` y, si es viable, `TLS_MUTUAL=true` (cifrado + autenticación mutua).
- **Clientes:** deben configurar `tls` en su `ClientProxy` (`ca` del servidor y, en mTLS, su propio `cert`/`key`).
- **Nota:** TLS de una vía autentica al servidor; **mTLS autentica ambas partes**. Si no se puede usar mTLS, al menos TLS + `SERVICE_API_KEY` (F1).

### Rate limiting del canal TCP

- Guard global **`RpcThrottlerGuard`** (`APP_GUARD`, tras `ServiceAuthGuard`): limita cada `@MessagePattern` por comando y por emisor (`serviceKey`).
- Límites por defecto (configurables por env): `login` 5/min · `refresh`/`changePassword` 10/min · `validateUser`/`validateSession` **6000/min** · resto 100/min.
- Env: `RPC_THROTTLE_ENABLED`, `RPC_THROTTLE_LOGIN`, `RPC_THROTTLE_REFRESH`, `RPC_THROTTLE_CHANGE_PASSWORD`, `RPC_THROTTLE_VALIDATE`, `RPC_THROTTLE_DEFAULT`. Por instancia (Redis en multi-instancia). El HTTP sigue con `ThrottlerHybridGuard`.

### Contrato de respuesta RPC y validación global

- **Toda respuesta TCP se envuelve:** `{ message, status, data, meta }` (sin `statusCode`). **El payload real está en `data`.**
- Error RPC: `{ message, status: 'Error', data: null, requestId, meta: { timestamp } }` (+ `code`/`errors`).
- `validateUser` → **`data.user`**; `validateSession` → **`data.active`** (ligero, sin lookup de usuario); `refresh` → **nuevo `refreshToken`**.
- **Estrategia recomendada (global):** validación **local** del JWT (firma/`iss`/`aud`/`exp`) + revocación vía `validateSession` con **caché corta (~15s)** por `sid`; `validateUser` solo en login; **fail-closed** si auth-ms no responde; 401 → logout, 429 → backoff.
- Detalle completo: `plans/ESTRATEGIA_VALIDACION_AUTH.md`.

### Validación de parámetros y auditoría

- `@ParamFormat({ param, kind })` + `ParamFormatGuard` (global): valida `:id`/`:userId` como ObjectId y `:key`/`:tenantId` con patrón seguro (400 si son inválidos), evitando que lleguen valores inválidos a Mongo.
- `AuditService` sanitiza `detail`: redacta claves sensibles (`password`, `token`, `refreshToken`, `accessToken`, `secret`, `serviceKey`, `authorization`, …) y trunca strings (512), profundidad (5) y arrays (50).

---

## 5. F3 — Canal REST reforzado (JWT o clave de servicio)

**Problema:** los clientes remotos usan también REST. Los frontends se autentican con JWT de usuario final; un servicio no debe necesitar un JWT de usuario para operaciones legítimas ni debe poder pasar sin identificarse.

**Solución:**
- Guard **`ServiceOrJwtGuard`** (`src/core/guards/service-or-jwt.guard.ts`):
  - Si envía header **`x-service-key`** válido → pasa con identidad de servicio (`req.user = { isService: true, ... }`).
  - Si no envía clave → delega en `AuthGuard('jwt')` (flujo normal de frontend).
  - Si envía clave inválida → `401`.
- Se aplica **por ruta** (opt-in), reemplazando a `AuthGuard('jwt')` donde los servicios necesiten acceso:
  - `GET /api/users/findByTenant` — scoped por tenant/empresa (los clientes deben enviar `x-company-id` / `x-tenant-id`).
  - `GET /api/users/profile` (+ `/modules`, `/roles`, `/permissions`) — con `x-user-id` para llamadas de servicio.
- **Resto de REST:** permanece JWT-only (protegido por `AuthGuard('jwt')` + TLS de nginx).

**Contrato para servicios en REST:**
```
GET /api/users/findByTenant?onlyAgents=true
x-service-key: <SERVICE_API_KEY>
x-company-id: <company>
x-tenant-id: <tenant>

GET /api/users/profile
x-service-key: <SERVICE_API_KEY>
x-user-id: <id-del-usuario>
```

---

## 5.1 Revocación de sesiones en la validación (HTTP y TCP)

**Problema:** un token revocado seguía siendo aceptado por las apps externas hasta su expiración, porque la validación TCP (`validateUser`) solo verificaba la firma.

**Solución (pull — se resuelve al validar):**
- **HTTP:** `JwtStrategy` exige `sid` (fail-closed) y consulta `isSessionActive`; token sin `sid` o sesión revocada → `401`.
- **TCP `validateUser`:** además de la firma, exige `sid` y valida la sesión activa; revocada → `401`.
- **TCP `validateSession`** (`{ serviceKey, token }`): booleano `{ active, valid, userId? }` sin lanzar.
- **Alcance:** un admin no-super solo revoca/listа sesiones de su empresa y **no** de SuperAdmins (403). El SuperAdmin revoca cualquiera.
- **Caché:** `SESSION_CACHE_TTL_MS` (0 = sin caché). Con varias instancias se recomienda `0` o Redis para que la revocación sea inmediata.
- **Clientes TCP:** si `validateUser` responde `401`, la app debe forzar cierre de sesión; no cachear la validación de autenticación.

---

## 6. F4 — Higiene de red (pendiente, operaciones)

- Auditar la publicación del puerto TCP (`docker-compose.yml` expone `3011:3011`). Si no es requerido hacia afuera, restringirlo:
  - No publicar el puerto al host, o
  - Publicarlo solo a rangos privados / IPs de los consumidores (firewall / security groups).
- Verificar que `MICROSERVICE_HOST` no escuche en interfaces públicas sin necesidad.
- **Recomendado:** unir los servidores por red privada / túnel (WireGuard, Tailscale, VPN site-to-site, VPC privada) para que el TCP nunca cruce internet público.

---

## 7. Orden de despliegue / coordinación

1. **`auth-ms`:** F1 (guard + env) → F2 (TLS configurable) → F3 (guard opt-in).
2. **Clientes TCP:** agregar `serviceKey` a todos los payloads (contrato F1) y `tls` en su `ClientProxy` (F2).
3. **Clientes REST:** agregar `x-service-key` (+ `x-company-id`/`x-user-id`) donde usen las rutas opt-in de F3.
4. **Operaciones:** F4 (firewall / VPN) según topología real.

> **Recordatorio:** el secreto compartido (F1) autentica pero **no cifra**. Sobre internet público solo es seguro combinado con TLS/mTLS (F2). El TLS de nginx no cubre el canal TCP.
