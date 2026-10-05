<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

---

## Documentación del proyecto

### Autenticación de servicios (canal TCP y REST interno)

El microservicio usa un **secreto compartido** para autenticar llamadas entre servicios:

- **Variable:** `SERVICE_API_KEY` (obligatoria, fail-fast en `env.validation.ts`).
- **Canal TCP (`@MessagePattern`):** todo payload debe incluir `serviceKey`. Los handlers que antes recibían una primitiva (`id`, `token`) ahora reciben `{ serviceKey, id }` / `{ serviceKey, token }`.
- **REST con acceso de servicio:** rutas opt-in (p. ej. `GET /api/users/profile`, `GET /api/users/findByTenant`) aceptan el header `x-service-key`. En `findByTenant` se exigen además `x-company-id` / `x-tenant-id`; en `profile` se envía `x-user-id` o `?userId=`.
- **Comparación** en tiempo constante (`crypto.timingSafeEqual`).

Ver `ESTRATEGIA_SEGURIDAD_TCP.md` para la estrategia completa (TLS/mTLS, red, etc.).

### Revocación de sesiones (auth-ms + apps externas)

La revocación se aplica **en el momento en que se valida el token/sesión** (pull), tanto en HTTP como en TCP:

- **HTTP:** `JwtStrategy` valida `sid` (fail-closed: token sin `sid` → 401) y consulta `isSessionActive`.
- **TCP:** `validateUser` valida además la sesión; una sesión revocada devuelve `UnauthorizedException`.
- **`validateSession`** (TCP, `{ serviceKey, token }`): chequeo **ligero** (firma + `sid` + sesión activa, **sin** lookup de usuario).
  Respuesta envuelta: `data = { active, valid, reason? }`.
- Todo payload TCP debe incluir `serviceKey`. Las respuestas TCP van envueltas en `{ message, status, data, meta }`.

**Estrategia global recomendada** (para todas las apps): validar el JWT **localmente** (firma/`iss`/`aud`/`exp`) +
revocación vía `validateSession` con **caché ~15s** por `sid`; `validateUser` solo en login (usuario en `data.user`);
**fail-closed** si auth-ms no responde con caché vencida. Detalle en `plans/ESTRATEGIA_VALIDACION_AUTH.md`.

Alcance de revocación:

- Un **admin** solo revoca/listа sesiones de usuarios de **su empresa** y **no** puede revocar sesiones de un
  **SuperAdmin** (403). El SuperAdmin revoca cualquier sesión.
- Los usuarios pueden gestionar sus propias sesiones (`/api/sessions/mine`).

Caché y escalabilidad:

- `SESSION_CACHE_TTL_MS` (default 30000) controla la caché de validez de sesión. `0` desactiva la caché
  (recomendado con varias instancias o al usar Redis).

### Documentación informativa (Swagger)

- `GET /api/tcp-docs` (o `/api/tcp-docs/message-patterns`): catálogo de todos los comandos TCP.
- `GET /api/rest-docs` (o `/api/rest-docs/endpoints`): catálogo de endpoints REST.

### Rate limiting del canal TCP

Los comandos `@MessagePattern` (TCP) también están limitados por `RpcThrottlerGuard`
(por comando y por emisor `serviceKey`):

- `login`: 5/min · `refresh` y `changePassword`: 10/min · `validateUser`/`validateSession`: **6000/min** · resto: 100/min.
- Todos configurables: `RPC_THROTTLE_ENABLED`, `RPC_THROTTLE_LOGIN`, `RPC_THROTTLE_REFRESH`, `RPC_THROTTLE_CHANGE_PASSWORD`, `RPC_THROTTLE_VALIDATE`, `RPC_THROTTLE_DEFAULT` (`0` = sin límite).
- El límite es **por instancia** (con varias instancias se recomienda Redis). El HTTP sigue usando `ThrottlerHybridGuard` y `@Throttle`.

### Seguridad (endurecimientos)

- **Anti-enumeración:** login y recuperación responden con mensaje genérico; login iguala tiempos con un `bcrypt` de relleno; `check-availability` es admin/superadmin.
- **Rotación de refresh + detección de reuso:** cada `refresh` emite un refresh nuevo; reutilizar uno ya rotado revoca **todas** las sesiones del usuario (auditoría `refresh.reuse`). Ahora `/api/auth/refresh` devuelve `refreshToken` nuevo.
- **Errores sanitizados:** `>=500` → mensaje genérico + `requestId`; duplicados (`11000`) → mensaje amigable por campo (sin colección/índice).
- **JWT:** `HS256` + `issuer`/`audience` (`JWT_ISSUER`/`JWT_AUDIENCE`) en firma y verificación; sin default de 30d.
- **Helmet + CORS:** cabeceras de seguridad; allowlist de CORS reutilizando `SSO_ALLOWED_ORIGINS`. Los endpoints de documentación (`/api-docs`, `/api/tcp-docs`, `/api/rest-docs`) siguen públicos.
- **Recovery y verificación por token de un solo uso:** recuperación envía enlace `…/set-password?token=…`; verificación con `POST /api/auth/verify-email` y reenvío en `POST /api/auth/resend-verification`.
- **Autorización de usuarios (A2b):** `roles` e `isAdmin` los gestiona un admin; `permissions`/`modules` solo un SuperAdmin (en creación individual, masiva y edición). El catálogo de roles/permisos/módulos es SuperAdmin.
- **Validación de parámetros (`@ParamFormat`):** `:id`/`:userId` como ObjectId y `:key`/`:tenantId` con patrón seguro → 400 si son inválidos.
- **Auditoría sanitizada:** `AuditService` redacta claves sensibles (`password`, `token`, `refreshToken`, …) y trunca estructuras profundas/largas.
- **Enlaces de correo con el front real:** los correos con enlace (invitación, bienvenida, recuperación, verificación) usan el **origen real de la petición** (`Origin`/`Referer` vía `resolveRequestOrigin`) y, si no hay, el front por defecto. **No** se usa `APP_URL` de entorno.


### Crear usuario superadmin en producción

En producción el seed automático **NO** crea administradores por defecto (evita credenciales públicas como `admin@admin.com` / `admin`). Para crear el primer superadmin de forma controlada:

```bash
# Con la app compilada (recomendado en producción)
MONGO_URI="mongodb://..." \
ADMIN_EMAIL="admin@empresa.com" \
ADMIN_PASSWORD="clave-fuerte" \
node dist/set-data-init/scripts/create-superadmin.js

# En desarrollo (ts-node)
ADMIN_EMAIL="admin@empresa.com" ADMIN_PASSWORD="clave-fuerte" npm run script:create-admin
```

Variables opcionales: `ADMIN_NAME`, `ADMIN_LASTNAME`, `ADMIN_USERNAME` (por defecto `admin`, `admin`, `ADMIN_EMAIL`). El usuario se crea con `isNewUser: true` para forzar el cambio de contraseña en el primer inicio de sesión. Si el usuario ya existe, el script no hace nada.

### Migración: unicidad global de `username` y `phone` opcional

`email` y `username` son únicos globales; `username` y `phone` son opcionales. Antes de desplegar esta versión hay que normalizar `username` (minúsculas, sin vacíos, sin duplicados) y ajustar los índices. Ejecutar **una vez** (con backup previo):

```bash
# Con la app compilada (recomendado en producción)
MONGO_URI="mongodb://..." \
  node dist/set-data-init/scripts/normalize-user-unique-fields.js

# En desarrollo (ts-node)
npm run script:normalize-unique-fields
```

Qué hace: normaliza `username` a minúsculas, elimina valores vacíos o con espacios, resuelve duplicados (conserva el primero por `_id` y limpia el resto), elimina el índice `phone_1` (`phone` deja de ser único) y recrea `username_1` como `unique + sparse`. Es idempotente.

Si no se ejecuta: la app **no se cae**, pero
- `phone` puede seguir siendo único en la BD (si existía `phone_1`) y fallar al crear un segundo usuario sin teléfono;
- `username_1` puede no crearse si hay duplicados/vacíos, dejando la unicidad solo a nivel de aplicación;
- los `username` antiguos con mayúsculas no podrán iniciar sesión por usuario (el login compara en minúsculas); el login por correo sigue funcionando.

### Validación de entrada

Se usa `ValidationPipe` global (`whitelist: true`, `transform: true`): los campos no declarados en los DTOs se eliminan automáticamente (anti mass-assignment). Requiere `class-validator`/`class-transformer` (ya instalados).

### Swagger

La documentación interactiva se sirve en `/api-docs` (requiere tener el servicio levantado).

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
