# Cómo organizar las aplicaciones para consumir las políticas de tenant (auth-ms)

Documento de guía para las aplicaciones que dependen de `authentication/auth-ms`.
auth-ms define las **políticas/configuración por tenant**; cada aplicación las
**consume, cachea y aplica** localmente.

---

## 1. Contrato que expone auth-ms

### TCP (microservicios, con `serviceKey`)
| Comando | Payload | Descripción |
|---|---|---|
| `getTenantConfig` | `{ serviceKey, tenantId?, company? }` | Config resuelta (defaults + valores) del tenant |
| `getTenantPolicyCatalog` | `{ serviceKey }` | Catálogo de políticas (definiciones) |
| `setTenantConfig` | `{ serviceKey, tenantId, values }` | (SuperAdmin) fija valores |
| `upsertPolicyDefinition` | `{ serviceKey, definition }` | (SuperAdmin) crea/edita definición |

### REST (`/api/tenants/...`)
- `GET  /api/tenants/config?tenantId=|company=` — lectura (service-key o JWT).
- `GET  /api/tenants/policy-catalog` — catálogo.
- `GET  /api/tenants` / `GET /api/tenants/config/:tenantId` — (SuperAdmin).
- `PUT  /api/tenants/config/:tenantId` · `PATCH /api/tenants/config/:tenantId/values` — (SuperAdmin).
- `POST/PUT/DELETE /api/tenants/policy-definitions...` — CRUD catálogo (SuperAdmin).
  Las políticas del sistema (`isSystem: true`) **no se pueden eliminar**; solo las
  creadas nuevas (`isSystem: false`).

### Forma de la config
`values` se guarda plano con claves con puntos y se expone **anidado**:

```jsonc
{
  "tenantId": "0000000",
  "company": "BPONET",
  "version": 4,
  "updatedAt": "2026-09-24T...",
  "general": { "timezone": "America/Bogota", "locale": "es-CO" },
  "channels": {
    "sms":  { "enabled": true, "monthlyLimit": 3000 },
    "audio":{ "enabled": true, "monthlyLimit": 1000 }
  },
  "messages": { "bolsa": { "utilidad": 1000, "marketingComercial": 1000, "autenticacion": 1000, "servicio": 1000 } },
  "features": { "crmInstitucional": true, "pbx": false },
  "limits": {
    "maxUsers": 0,
    "roles": { "AGE": 50 },
    "maxChatbotFlows": 20
  }
}
```

> `limits.roles.<CODE>` limita cuántos usuarios con ese rol (`codeRol`) puede
> tener el tenant. `0` = ilimitado. Las definiciones `limits.roles.<CODE>` se
> registran automáticamente al crear el rol.

---

## 2. Patrón estándar en CADA aplicación

Crear un módulo compartido `TenantConfigModule` (global) con:

1. **Variables de entorno**
   - `USER_MS_HOST`, `USER_MS_PORT` (3011), `SERVICE_API_KEY`
   - `TENANT_CONFIG_API_BASE` (para consumo REST)
   - `TENANT_CONFIG_CACHE_TTL_MS` (ej. `600000`)
   - `TENANT_CONFIG_FALLBACK` (`open` por defecto)
2. **Cliente**: reutilizar el `ClientProxy` `USER_SERVICE` (TCP) y/o `HttpService` (REST).
3. **Servicio con caché en memoria**: `Map<tenantId, { config, version, fetchedAt }>`
   con TTL; al expirar reconsulta; si falla → caché → defaults.
4. **Helpers**: `can(tenantId, featureKey)`, `getLimit(tenantId, policyKey)`,
   `getTimezone(tenantId)`.
5. **Resolución del tenant**: preferir JWT/contexto (`company`, `tenantId`),
   fallback headers `x-tenant-id` / `x-company-id`. Normalizar
   **`tenantId = Company.id`** (no `_id`).
6. **Defaults locales**: espejo mínimo de las políticas clave para arrancar sin config.

```
TenantConfigModule (global)
 ├─ TenantConfigClient   (TCP + REST)
 ├─ TenantConfigService  (cache TTL + version + fail-open)
 ├─ DEFAULT_TENANT_CONFIG
 └─ (opcional) TenantContextInterceptor
```

---

## 3. Aplicación de las políticas (enforcement local)

auth-ms solo define la política; **cada app la aplica en su punto de uso**:
- Antes de enviar mensaje: validar `channels.*.enabled` y `monthlyLimit` / `messages.bolsa.*`.
- Features: habilitar/ocultar módulos (`features.*`).
- Límites: `limits.maxUsers`, `limits.roles.<CODE>`, `limits.trialDays` y
  `limits.maxChatbotFlows` (reemplaza hardcodeados). `0` = ilimitado/sin expiración.

### Enforcement autoritativo (auth-ms)

auth-ms es la autoridad de creación de usuarios y aplica los topes de forma
central y **fail-closed**: creación individual, carga masiva y
`createExternalUser` (TCP). Si el tenant supera `limits.maxUsers` o
`limits.roles.<CODE>`, responde `409 Conflict` con el límite en el mensaje.

Las apps externas:
- **No** deben crear usuarios por fuera de auth-ms ni duplicar los topes.
- Pueden pre-validar con `getTenantConfig` para UX, pero deben manejar el `409`.
- Solo cuentan usuarios **activos y no borrados** (`isActived: true`,
  `deletedAt: null`).

### Políticas de seguridad de login (`security.*`)

Se validan en `auth-ms` al iniciar sesión (HTTP y TCP), por tenant:
- `security.maxFailedAttempts`: intentos fallidos permitidos. `0` = ilimitados.
  El bloqueo se aplica al **exceder** el máximo (con 3, se bloquea en el 4º).
- `security.lockMinutes`: duración del bloqueo temporal. `0` = bloqueo
  **indefinido** (permanente hasta que un admin lo levante).
- Un bloqueo sin `blockedUntil` es permanente; con fecha, se levanta al vencer.
- Fechas/TZ: usar `general.timezone` / `general.locale`.

### Usuarios en período de prueba

- Al crear un usuario individual con `isTrial: true`, auth-ms fija
  `trialStartedAt` y `trialEndsAt = ahora + días`.
- Días: `limits.trialDays` (default **7**, igual que `TEST_USER_DAYS`) o el env
  `TEST_USER_DAYS`. `0` en el env = prueba sin expiración.
- Al vencer, el login se bloquea con `code: "TRIAL_EXPIRED"` (no se muta el usuario).

### Bloqueo por empresa

- `Company.isBlocked` + `blockReason` + `blockedUntil` (null = indefinido).
- Endpoints SuperAdmin: `PATCH /companies/:id/block` (`{reason?, until?}`) y
  `PATCH /companies/:id/unblock`; TCP `blockCompany` / `unblockCompany`.
- Si la empresa está bloqueada, **ningún** usuario del tenant inicia sesión
  (`code: "COMPANY_BLOCKED"`).

### Contrato de error de login (HTTP y TCP)

El login responde `403` con todos los motivos aplicables (uno o varios), en
precedencia empresa → usuario → prueba → inactivo:

```jsonc
{
  "message": "Tu empresa está bloqueada.",
  "code": "COMPANY_BLOCKED",
  "errors": [
    { "code": "COMPANY_BLOCKED", "message": "...", "details": { "blockType": "temporary", "until": "..." } }
  ],
  "status": "Error",
  "data": null,
  "meta": { "timestamp": "...", "path": "/api/auth/login" }
}
```

Códigos: `COMPANY_BLOCKED`, `USER_BLOCKED_TEMPORARY`, `USER_BLOCKED_INDEFINITE`,
`TRIAL_EXPIRED`, `USER_INACTIVE`.

### Contraseñas y primer acceso (`mustChangePassword` / `isNewUser`)

- `mustChangePassword` es la bandera **canónica** (el backend bloquea endpoints
  con `MustChangePasswordInterceptor` hasta que el usuario cambie la clave).
- `isNewUser` se mantiene **en sincronía** por compatibilidad con apps externas
  que aún lo consumen.
- Transiciones:

| Flujo | `mustChangePassword` | `isNewUser` |
|---|---|---|
| Crear (invitación o temporal) | `true` | `true` |
| Establecer por token (invitación) | `false` | `false` |
| Recuperación / reset admin (temporal) | `true` | `true` |
| Cambiar contraseña | `false` | `false` |

> Apps externas: pueden seguir leyendo `isNewUser`; a futuro se recomienda usar
> `mustChangePassword` como fuente de verdad.

---

## 4. Consumo / uso

El **consumo ya no se centraliza en auth-ms**. Cada aplicación mantiene su propio
contador de uso en su base de datos y lo muestra en su propio dashboard. auth-ms
solo define las **políticas** (features, canales, límites) que las apps consumen y
aplican localmente.

---

## 5. Organización por aplicación

- **educative-backend**: ya tiene `USER_SERVICE` TCP con `serviceKey`. Agregar
  `TenantConfigModule`; reemplazar la TZ fija de notificaciones por
  `general.timezone`; aplicar cuota SMS (`channels.sms` / `messages.*`); reportar uso.
- **crm-campaign-backend**: **primero** agregar `serviceKey` a TODOS los `cmd`
  (`changePassword`, `refreshAccessToken`, `findUserById`, `createExternalUser`).
  Luego `TenantConfigModule` y validar features/límites al crear líderes.
- **api-whatsapp (API)**: usa TCP con `serviceKey`; agregar config y reemplazar
  límites hardcodeados (50 agentes, 20 flujos) por `limits.*`; modelar categorías
  (`whatsapp.utilidad|marketingComercial|autenticacion|servicio`, `audio`) y
  reportar uso. **Web**: consumir `GET /api/tenants/config` con `Bearer`; corregir
  `/users/findByTenant` (usar `x-service-key` + `x-company-id/x-tenant-id` o JWT).
- **web-sockets-api (Rust) / bots**: si necesitan políticas, cliente HTTP interno a
  `GET /api/tenants/config` con `x-service-key`, caché TTL y fail-open; si no,
  dejarlos fuera de esta fase.
- **comercializadoras**: mantiene su config local; para centralizar, migrar su
  `configuraciones` a políticas de auth-ms con el mismo patrón.

---

## 6. Checklist de migración por app

1. Envs (`USER_MS_*`, `SERVICE_API_KEY`, `TENANT_CONFIG_*`).
2. Crear `TenantConfigModule` (cliente + cache + defaults).
3. Resolver tenant desde el contexto/JWT (normalizar `tenantId = company.id`).
4. Reemplazar valores hardcodeados por `getLimit` / `can`.
5. Aplicar TZ/locale.
6. Mantener el consumo local en la app (no se reporta a auth-ms).
7. Pruebas: cache, fail-open, cuota excedida, feature off.
8. Documentar contrato/versión.

---

## 7. Reglas de compatibilidad

- No romper endpoints existentes; agregar los nuevos.
- Usar `version` / `updatedAt` para invalidar caché (o refresco periódico).
- **Fail-open** por defecto; loguear cuando se use default/caché.
- Convención: `tenantId = Company.id` (ej. `0000000`), `company = Company.name`
  (ej. `BPONET`). Revisar `create-superadmin.ts` (hoy usa `company._id`).

---

## 8. Frontends

- Consumir REST con `Authorization: Bearer` y cachear en memoria/servicio.
- Usar `features.*` para mostrar/ocultar y `limits.*` para deshabilitar acciones.
- Formatear fechas con `general.timezone` / `general.locale`.
