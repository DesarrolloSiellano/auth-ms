# Reglas contradictorias / inconsistencias detectadas

> Fecha: 2026-10-01
> Contradicciones entre documentación y código actual (o entre decisiones tomadas). Cada punto indica la resolución propuesta.

---

## 1. Contrato TCP con `context` (docs) vs implementación real
- **Regla documentada** (`plans/PLAN_SEGURIDAD_TENANT.md` §Alcance y §3): los handlers TCP de `users` exigen `context` en el payload (fail-closed); `createExternalUser` respeta `isSuperAdmin` solo si el `context` lo declara.
- **Realidad del código:** `RpcTenantContextInterceptor` deriva el tenant de `payload.company/tenantId` o `payload.user.*`; **no existe `context`** ni fail-closed. `createExternal` usa `company` directo y `isSuperAdmin` del payload.
- **Resolución:** actualizar `PLAN_SEGURIDAD_TENANT.md` para documentar el contrato real (`serviceKey` + `company/tenantId`), o implementar `context` formal si se desea fail-closed. **No** dejar el doc prometiendo un contrato inexistente.

## 2. Helper `tenant-scope.helper.ts` inexistente
- **Regla documentada:** `buildTenantScope`/`requireTenantScope`/`isInTenantScope` en `src/core/database/tenant-scope.helper.ts`.
- **Realidad:** el aislamiento se implementó con `tenant.plugin.ts` + interceptores de contexto; el helper no existe.
- **Resolución:** eliminar la sección del plan o crear el helper si se decide migrar a scoping explícito.

## 3. `UpdateUserDto`: excluir `permissions/modules` (C4) vs incluirlos (A2b)
- **Regla C4 inicial:** el DTO **excluía** `permissions`/`modules` del update.
- **Decisión final A2b:** el DTO **incluye** `permissions`/`modules` y el servicio los permite **solo SuperAdmin** (se ignoran para admin).
- **Resolución:** documentar A2b como estado vigente y anotar C4 como “superado por A2b”.

## 4. CORS: `CORS_ORIGIN` vs `SSO_ALLOWED_ORIGINS`
- **Regla:** `main.ts` usa **`SSO_ALLOWED_ORIGINS`** para CORS.
- **Inconsistencia:** `env.validation.ts` aún declara **`CORS_ORIGIN`** (default `*`), que ya no se usa.
- **Resolución:** eliminar `CORS_ORIGIN` del schema/env o marcarlo obsoleto.

## 5. Recovery: “depende del checkbox” vs “siempre token”
- **Propuesta discutida (Opción A):** recovery usaría token o contraseña temporal según el modo de creación del usuario.
- **Decisión final (Opción C):** recovery usa **siempre token de un solo uso**.
- **Resolución:** documentar Opción C como vigente (ya implementada) y descartar A.

## 6. `isAdmin` en update: 403 (C4) vs ignorar (A2b)
- **Regla C4:** el controller lanzaba **403** si un no-SuperAdmin enviaba `isAdmin`.
- **Decisión final A2b:** se **ignora** (no 403) para no romper el formulario; `isAdmin` lo gestiona admin.
- **Resolución:** documentar A2b; el 403 anterior queda obsoleto.

## 7. Doble mecanismo de validación de id
- **Inconsistencia:** coexisten `ValidateObjectIdGuard` (solo `params.id`) y `ParamFormatGuard` (`@ParamFormat` por metadata).
- **Resolución:** migrar todo a `@ParamFormat`/`ParamFormatGuard` y retirar `ValidateObjectIdGuard`.

## 8. Roles: ¿globales o por tenant?
- **Regla:** roles/permissions/modules son **globales** (sin tenant).
- **Inconsistencia:** `roles/entities/role.entity.ts` declara `company`/`tenantId` (aunque no usa `tenantPlugin`).
- **Resolución:** eliminar esos campos de `Role` (si no se usan) o documentar como legado.

## 9. “Roles solo SuperAdmin” vs “admin asigna roles a usuarios”
- **Regla (catálogo):** crear/editar/eliminar roles → **solo SuperAdmin**.
- **Regla (asignación):** un **admin** puede asignar `roles` a usuarios de su empresa (A2b).
- **¿Contradicción?** No, son ámbitos distintos (catálogo vs asignación). **Riesgo de confusión.**
- **Resolución:** documentar explícitamente ambos ámbitos para evitar malentendidos.

## 10. `JWT_EXPIRATION` (legado) vs `JWT_ACCESS_EXPIRATION`
- **Inconsistencia:** `env.validation.ts` declara `JWT_EXPIRATION` (def. `1h`) pero **no se usa**; el código usa `JWT_ACCESS_EXPIRATION`.
- **Resolución:** eliminar `JWT_EXPIRATION` o documentarlo como obsoleto.

## 11. Plantilla `verify.hbs`: OTP vs enlace
- **Inconsistencia:** la plantilla se rediseñó a **enlace de un solo uso**, pero conserva CSS `.otp-box`/`.otp-code` (residuo de “código OTP”).
- **Resolución:** limpiar CSS residual; aclarar que la verificación es por enlace, no por código.

## 12. Rate limiting: valores y ámbitos dispersos
- **Inconsistencia:** docs/guía mencionan throttling HTTP (10/min) y `@Throttle` (login 5/min); ahora también existe límite **TCP** por comando (`RpcThrottlerGuard`).
- **Resolución:** consolidar una tabla única de límites (HTTP y TCP) en la documentación.

## 13. Origen de los enlaces de correo (resuelto)
- **Inconsistencia previa:** recuperación/verificación usaban `APP_URL` del entorno mientras invitación/bienvenida usaban el **origen de la petición** → enlaces podían apuntar a un front distinto.
- **Resolución (aplicada):** todos los correos con enlace usan `resolveRequestOrigin(req)` (Origin/Referer) y, si no existe, `DEFAULT_FRONT_URL`. **Se dejó de usar `APP_URL` de entorno.**

