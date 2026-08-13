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
