# Reglas de la aplicación — estado actual (2026-10-01)

> Resumen de las reglas vigentes tras C1–C5, A2, M1–M6 y B1–B4. Sirve como contrato actual del `auth-ms`.

## 1. Autenticación y JWT
- **Algoritmo:** `HS256` fijo, en firma y verificación.
- **`issuer` / `audience`:** `JWT_ISSUER` (def. `bponet-auth`) y `JWT_AUDIENCE` (def. `bponet-apps`) en `sign` y `verify` (Passport, TCP y refresh).
- **Expiración:** access `JWT_ACCESS_EXPIRATION` (def. `1h`); refresh `JWT_REFRESH_EXPIRATION` (def. `7d`). **Sin default 30d**.
- **`sid` obligatorio (fail-closed):** todo access token debe traer `sid`; si no, 401.
- **Claims de identidad:** `_id, name, lastName, email, username, isActived, company, tenantId, isSuperAdmin, isTrial, trialStartedAt, trialEndsAt, emailVerified, sid`. **No** incluye modules/roles/permissions.
- **`emailVerified`:** `true` si `emailVerifiedAt` está set (usado por el banner del front).

## 2. Sesiones
- **Revocación inmediata:** HTTP (`JwtStrategy`) y TCP (`validateUser`) consultan `isSessionActive(sid)`. `validateSession` devuelve `{ active }` sin lanzar.
- **Rotación de refresh:** cada `refresh` emite **nuevo** `refreshToken` (se guarda hasheado), archiva el anterior en `usedRefreshTokens` (últimos 5).
- **Detección de reuso:** presentar un refresh ya rotado → **revoca todas las sesiones del usuario** + auditoría `refresh.reuse`.
- **Alcance por rol:** admin no-super lista/revoca solo sesiones de su empresa y **no** de SuperAdmins; SuperAdmin sin filtro. La sesión guarda `isSuperAdmin` (denormalizado).
- **Caché:** `SESSION_CACHE_TTL_MS` (def. `30000`; `0` = sin caché para multi-instancia).

## 3. Aislamiento multi-tenant
- **Contexto de tenant (HTTP):** se establece desde la **identidad verificada** (`req.user`) mediante `TenantContextInterceptor`. `TenantMiddleware` quedó **no-op**.
- **Contexto de tenant (TCP):** `RpcTenantContextInterceptor` lo deriva de `payload.company/tenantId` o `payload.user.*`. No acepta `isSuperAdmin` desde el payload.
- **`tenantPlugin`:** filtra por `company` en `find/findOne/findById* /findOneAndUpdate/…` y **fuerza `company/tenantId`** al crear (no-superadmin). Bypass para `isSuperAdmin` y `bypassTenant`.
- **Entidades scoped:** User, Session, AuditLog, SavedFilter, CustomField.
- **Entidades globales (sin tenant):** Role, Permission, Module, Company, TenantConfig.

## 4. Autorización
- **Catálogo roles/permisos/módulos:** crear/editar/eliminar → **solo SuperAdmin**; lecturas → **admin+superadmin**.
- **Empresas:** CRUD/block/unblock/lecturas → **SuperAdmin**; `findByAutoComplete` → admin+superadmin.
- **Usuarios (creación/edición) — A2b:**
  - `roles` e `isAdmin` → los gestiona **admin** (roles con validación de topes).
  - `permissions` y `modules` → **solo SuperAdmin** (en creación individual, masiva y edición; se ignoran para admin).
  - `isSuperAdmin` → **solo SuperAdmin** (en creación y edición); para el resto se ignora.
  - Campos nunca editables: `company, tenantId, password, tokens, _id, created/modified`.
  - Admin no puede modificar a un SuperAdmin.
- **Creador externo (TCP):** confiable (puede asignar roles/permissions/modules y `_id` válido).
- **`check-availability`:** admin+superadmin.
- **Reportes/masiva:** requieren admin/superadmin (validado en servicio/controller).

## 5. Políticas por tenant (catálogo)
- **Implementadas/enforced:** `security.maxFailedAttempts`, `security.lockMinutes`, `preferences.notifications`, `preferences.notifications.newLogin`, `channels.email.enabled`, `features.notificaciones`, `features.invitations`, `features.userTags`, `features.userGroups`, `features.customFields`, `limits.maxUsers`, `limits.roles.<CODE>`, `limits.trialDays`, `general.timezone`, `general.locale`.
- **Externas (solo reportadas/cotizadas, no enforced aquí):** canales SMS/WhatsApp/audio, `messages.*` (bolsa), `features` de producto (QR, IA, chatbot, PBX…), `limits.maxStorageMb`, `limits.maxChatbotFlows`.
- **`general.timezone`/`general.locale`:** tipo `select`; auditoría/correos/reportes usan `LocaleService` (solo visualización).
- **`limits.maxAgents`:** **eliminada** (obsoleta; reemplazada por `limits.roles.AGE`). Se purga al arrancar.

## 6. Correo
- **Nunca se suprime:** recuperación / set-password (seguridad).
- **`channels.email.enabled=false`:** bloquea todo correo del tenant **salvo** seguridad.
- **`features.notificaciones=false`:** bloquea notificaciones (nuevo login, bienvenida, invitación).
- **`preferences.notifications` / `.newLogin`:** solo aviso de nuevo login.
- **Verificación de correo:** se envía token de un solo uso en **todas** las altas (individual, masiva, externa). No bloquea login; banner + reenvío.
- **Recovery:** **siempre** token de un solo uso (Opción C), nunca contraseña temporal.
- **Invitación vs contraseña temporal:** `invite=true` → enlace de token; `invite=false` → usuario + contraseña temporal.
- **URL de los enlaces:** todos los correos con enlace (invitación, bienvenida, recuperación, verificación) usan el **origen real de la petición** (`Origin`/`Referer`); si no existe, el front por defecto. **No** se usa `APP_URL` del entorno.

## 7. Anti-enumeración y errores
- **Login:** mensaje/código genéricos (`Credenciales inválidas` / `INVALID_CREDENTIALS`) para “no existe” y “password mala”, igualando tiempos con bcrypt dummy.
- **Recovery:** respuesta **genérica** siempre.
- **Errores:** `>=500` → “Error interno…” + `requestId` (detalle solo en logs). `11000` → mensaje amigable por campo (sin colección/índice), status 409. 4xx conservan detalle.

## 8. TCP (microservicios)
- **`serviceKey` obligatorio** en todo payload (comparación en tiempo constante).
- **Rate limiting:** `RpcThrottlerGuard` por comando y por emisor. `login` 5/min; `refresh`/`changePassword` 10/min; `validateUser`/`validateSession` 600/min; resto 100/min. Toggle `RPC_THROTTLE_ENABLED`.
- **Comandos de auth:** `login`, `validateUser`, `validateSession`, `refresh`, `changePassword` (los `validate*` rechazan sesión revocada / sin `sid`).
- **Entidades globales:** mutaciones TCP permitidas (Opción B) confiando en las apps.
- **`createExternalUser`:** `company` obligatoria; `_id` opcional validado como ObjectId.

## 9. HTTP / plataforma
- **Helmet** activo (CSP compatible con Swagger UI).
- **CORS:** allowlist por hostname reutilizando `SSO_ALLOWED_ORIGINS` (sin `*` en prod).
- **Docs públicas:** `/api-docs`, `/api/tcp-docs`, `/api/rest-docs`.
- **Validación de entrada:** `ValidationPipe` (`whitelist: true`).
- **Params:** `@ParamFormat` valida `:id`/`:userId` (ObjectId) y `:key`/`:tenantId` (patrón seguro) → 400.

## 10. Auditoría
- `AuditService.sanitizeDetail`: redacta claves sensibles (`password, token, refreshToken, accessToken, passwordResetToken, emailVerificationToken, secret, serviceKey, authorization, apiKey`), trunca strings (>512), profundidad (5) y arrays (50).

## 11. Variables de entorno nuevas/relevantes
- `JWT_ISSUER`, `JWT_AUDIENCE`, `SESSION_CACHE_TTL_MS`, `RPC_THROTTLE_ENABLED`.
- `SSO_ALLOWED_ORIGINS` (también usada para CORS).
- `SERVICE_API_KEY`, `TLS_ENABLED/TLS_MUTUAL` (TCP).
- `JWT_ACCESS_EXPIRATION`, `JWT_REFRESH_EXPIRATION`, `JWT_SECRET`, `JWT_REFRESH_SECRET`.
