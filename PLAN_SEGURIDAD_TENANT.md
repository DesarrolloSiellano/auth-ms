# Plan: Aislamiento por empresa/tenant (users y sessions) + TCP + escalamiento de privilegios

> Documento de planificación. Pendiente de implementación.

## Objetivo
Garantizar que un usuario administrador solo vea usuarios y sesiones de su empresa/tenant, que el superadmin vea todos sin importar la empresa, en canales HTTP y TCP; eliminar el escalamiento de privilegios y unificar el criterio de filtrado `company`/`tenantId`.

## Alcance
- Users y Sessions: aplicación de la regla en HTTP y TCP.
- Roles, permissions y modules: **globales, sin tenant** (fuera de alcance).
- Canal TCP: se maneja (contrato `context` en payloads).
- Confianza TCP: el `serviceKey` autentica al servicio; se confía en el `context` declarado en el payload.
- `createExternalUser`: `isSuperAdmin: true` solo se respeta si el `context` del llamante lo declara; si no, se fuerza `false`. `company`/`tenantId` se conservan del payload.

## Cambios

### 1. Nuevo helper `src/core/database/tenant-scope.helper.ts` (+ spec)
- `CallerContext`: `{ isSuperAdmin?, isAdmin?, isService?, company?, tenantId?, _id? }`.
- `buildTenantScope(context)`: superadmin/sin contexto → `{}`; si no, `$or` normalizado con valores deduplicados de `[company, tenantId]` comparados contra ambos campos (`company` y `tenantId`). Un único criterio = fin de la inconsistencia.
- `requireTenantScope(context)`: `ForbiddenException` si no es superadmin y no aporta tenant (fail-closed).
- `isInTenantScope(record, context)`: validación en memoria.

### 2. `UsersService` — scope explícito en capa de servicio
- `findAll`, `findByPage`, `findByPagination`, `findByDate`, `findActiveByTenant`: reemplazar filtros ad-hoc por `buildTenantScope(user)`.
- `findOne`/`update`/`remove`: inyectar scope en la query (`{ _id, ...scope }`), sin depender del middleware. Cierra fuga por TCP (`msFindById`/`msUpdate`/`msRemove`).
- `getProfile` y derivados: self por `_id`; en llamadas de servicio validar tenant del target si no es superadmin.
- `create`/`update`: no-superadmin → forzar `company`/`tenantId` desde el context y bloquear `isSuperAdmin: true` y cambio de tenant.
- `createExternal`: respetar `company`/`tenantId` del payload; `isSuperAdmin: true` solo si el `context` del llamante lo declara.

### 3. `UsersController` — contrato TCP con `context`
- Todos los handlers `ms*` extraen `context` del payload y lo pasan al servicio.
- Fail-closed: handlers scoped exigen `context` con tenant (o `isSuperAdmin: true`); si falta → `ForbiddenException`.
- HTTP `create`/`update`/`remove` ahora validan ownership del target (403/404).
- Actualizar `tcp-docs/message-patterns` con el nuevo payload (`serviceKey`, `context`, resto).

### 4. `SessionsService` — tenant-aware
- `createSession`, `findActiveByRefreshHash`, `deactivateByRefreshHash`: parámetro opcional `context` que aplica `buildTenantScope` cuando es no-superadmin. Login/refresh internos sin context conservan comportamiento actual.

### 5. Consistencia en `TenantPlugin` y `TenantMiddleware`
- `tenant.plugin.ts`: usar `buildTenantScope` (company **o** tenantId) en vez de solo `company`. Actualizar spec.
- `tenant.middleware.ts`: si el JWT trae `tenantId` pero no `company`, usar `tenantId` como fallback para establecer contexto.

### 6. Documentación
- `ESTRATEGIA_SEGURIDAD_TCP.md`: contrato nuevo `{ serviceKey, context, ...payload }` para handlers de users y nota de compatibilidad.

## Impacto / breaking changes
- **HTTP/REST (frontends):** sin cambios en flujos legítimos. Cambia solo el comportamiento que era agujero: `create`/`update` fuerzan `company`/`tenantId` del token y bloquean `isSuperAdmin` para no-superadmin; `findOne`/`update`/`remove` de usuarios de otra empresa → 403/404. JWT/identity payload sin cambios.
- **TCP (breaking):** handlers de users requieren `context` en el payload (fail-closed). Los consumidores (crm-campaign-backend, educative-backend, tickets-bpo-backend, contratos-backend-bpo, api-whatsapp) deben actualizarse. `context` se deriva del JWT que ya validan (contiene company/tenantId/isSuperAdmin).
- **Despliegue coordinado:** auth-ms es el límite de seguridad; si se despliega con fail-closed sin actualizar consumidores TCP, su `findUserById` devolverá 403 (caería la autenticación de esas apps). Actualizar consumidores en el mismo release.

## Verificación
- Specs: `tenant-scope.helper.spec`, `users.service.spec` (cross-tenant 403/404, escalamiento bloqueado, contexto TCP), `sessions.service.spec`, `tenant.plugin.spec`.
- Ejecutar `npm test`, lint y build.

## Archivos
- Nuevo: `src/core/database/tenant-scope.helper.ts` (+ spec)
- Modificados: `users.service.ts`, `users.controller.ts`, `sessions.service.ts`, `tenant.plugin.ts`, `tenant.middleware.ts`, `ESTRATEGIA_SEGURIDAD_TCP.md` + specs de cada uno.
