# Seguridad — Puntos pendientes de implementar

> Fecha: 2026-10-01
> Complementa los críticos, altos, medios y bajos ya resueltos (C1–C5, A2, M1–M6, B1–B4).
> Este documento lista lo que **falta** con: estado actual, solución propuesta y riesgos.

## Leyenda de severidad
- **ALTO**: explotable con impacto relevante.
- **MEDIO**: reduce defensa en profundidad.
- **BAJO**: higiene / robustez.

---

## A1. `ServiceOrJwtGuard` confía en headers del llamante (ALTO)
- **Estado actual:** con `x-service-key` válido, `request.user.company/tenantId` salen de `x-company-id`/`x-tenant-id` **sin validar** (`core/guards/service-or-jwt.guard.ts`). Rutas: `users/findByTenant`, `users/profile*`, `tenants/config`, `tenants/policy-catalog`, `tenants/usage/:tenantId`, `tenants/usage/report`.
- **Impacto:** cualquiera con la clave compartida puede apuntar a cualquier tenant (fuga cross-tenant). Frontera = `SERVICE_API_KEY`.
- **Solución propuesta:**
  - `profile*`: derivar el tenant del **usuario** (`x-user-id` → BD), ignorando headers de tenant.
  - `findByTenant`/tenants: **clave por app + allowlist de tenants** (o interino: validar tenant contra lista).
  - No aceptar `company/tenantId` de headers para decidir alcance.
- **Riesgos:** cambio de contrato para apps; requiere gestión/rotación de claves y desplegar coordinado. Interino con clave compartida sigue sin aislar entre apps.

## A3. Spoofing de IP (`x-forwarded-for`) (ALTO)
- **Estado actual:** `ThrottlerHybridGuard.getTracker` y `@RealIP()` (nestjs-real-ip → @supercharge/request-ip) usan el header crudo; `main.ts` no configura `trust proxy`.
- **Impacto:** evasión de rate limit HTTP y envenenamiento de IP en auditoría/sesión.
- **Solución propuesta:** decidir topología → si hay proxy confiable: `app.set('trust proxy', <nº saltos/CIDR>)` y usar `req.ip`; si expuesto directo: `req.socket.remoteAddress`.
- **Riesgos:** mal configurar `trust proxy` permite falsificar IP igualmente; si se ignora XFF y hay proxy, todos comparten la IP del proxy (throttle grueso).

## A4. Docker filtra secretos (ALTO)
- **Estado actual:** sin `.dockerignore`; `Dockerfile` hace `COPY . .` (copia `.env`), `npm install`, una etapa, corre como **root**, sin `HEALTHCHECK`; `docker-compose.yml` publica `3011:3011`.
- **Impacto:** secretos (`JWT_SECRET`, `SERVICE_API_KEY`, `MONGO_URI`, SMTP) en la imagen; root en contenedor; TCP expuesto.
- **Solución propuesta:** `.dockerignore` (`.env*`, `node_modules`, `dist`, `coverage`, `logs`, `.git`, `test`); multi-stage + `npm ci` + `USER node` + healthcheck; secretos por runtime (env_file/docker secrets/vault); no publicar `3011` (red interna + TLS/mTLS).
- **Riesgos:** cambiar el Dockerfile puede romper el arranque si faltan assets (templates de correo); no publicar `3011` requiere ajustar la red de los consumidores TCP.

## M7. TCP sin TLS por defecto (MEDIO/ALTO)
- **Estado actual:** `TLS_ENABLED=false` por defecto; en TCP viajan `serviceKey`, credenciales de `login` y tokens.
- **Solución propuesta:** TLS (idealmente mTLS) en despliegues no locales; `3011` en red interna.
- **Riesgos:** configurar TLS/mTLS exige certificados y actualizar `ClientProxy` en las apps; mal configurado rompe la comunicación M2M.

## M4 (residual). CORS/`CORS_ORIGIN` (BAJO)
- **Estado actual:** `main.ts` usa `SSO_ALLOWED_ORIGINS`; `env.validation` aún declara `CORS_ORIGIN` (ya sin uso).
- **Solución propuesta:** eliminar `CORS_ORIGIN` del schema/env o documentarlo como obsoleto.
- **Riesgos:** nulo (limpieza).

## M5 (residual). JWT legacy (BAJO)
- **Estado actual:** `JWT_EXPIRATION` sigue en `env.validation` (default `1h`) pero el código usa `JWT_ACCESS_EXPIRATION`. Docs antiguas pueden referenciar `30d`.
- **Solución propuesta:** eliminar/renombrar o documentar `JWT_EXPIRATION` como legado.
- **Riesgos:** nulo.

## Rate limiting multi-instancia (MEDIO)
- **Estado actual:** `RpcThrottlerGuard` (TCP) y `ThrottlerHybridGuard` (HTTP) usan almacenamiento **en memoria** por instancia.
- **Solución propuesta:** storage compartido (Redis) para límites globales.
- **Riesgos:** dependencia de Redis; si cae, decidir fail-open/fail-closed.

## Verificación de correo: bloqueo opcional (MEDIO)
- **Estado actual:** verificación "suave" (auto-envío + banner + reenviar); login **no** exige `emailVerifiedAt`.
- **Solución propuesta (futuro):** política por tenant para exigir verificación en login, con flujo de reenvío y migración de usuarios existentes.
- **Riesgos:** bloquear login puede dejar fuera a usuarios legacy sin `emailVerifiedAt`.

## Rotación/refresco de claves y secretos (MEDIO)
- **Estado actual:** `SERVICE_API_KEY` única y estática; sin rotación.
- **Solución propuesta:** claves por app, rotación y allowlist (Fase 3 de A1).
- **Riesgos:** operativo (rotar sin cortar servicio).

## Auditoría de mutaciones TCP de entidades globales (BAJO)
- **Estado actual:** roles/permissions/modules/companies por TCP solo exigen `serviceKey` (Opción B).
- **Solución propuesta:** añadir auditoría específica; a futuro restringir/allowlist.
- **Riesgos:** sobrecarga de logs.

## `Role` entity con `company/tenantId` sin uso (BAJO)
- **Estado actual:** `roles/entities/role.entity.ts` declara `company`/`tenantId` pero **no** usa `tenantPlugin` (roles globales).
- **Solución propuesta:** eliminar los campos si no se usan, o documentar.
- **Riesgos:** migración de colección si se eliminan.

## Doble validación de id (`ValidateObjectIdGuard` + `ParamFormatGuard`) (BAJO)
- **Estado actual:** conviven ambos; `ValidateObjectIdGuard` valida solo `params.id`.
- **Solución propuesta:** migrar todo a `@ParamFormat`/`ParamFormatGuard` y retirar el anterior.
- **Riesgos:** bajo.
