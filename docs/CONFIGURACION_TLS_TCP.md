# Configuración de TLS/mTLS en el canal TCP de auth-ms

> Guía operativa para cifrar y autenticar el canal TCP (`Transport.TCP`, puerto `3011`)
> entre `auth-ms` y las aplicaciones consumidoras, tanto **remotas** (otro servidor)
> como **locales** (mismo servidor).
>
> Versión 1.0 · Octubre 2026
> Referencias: `plans/ESTRATEGIA_SEGURIDAD_TCP.md`, `guias/GUIA_INTEGRACION_APIS_EXTERNAS.html`

---

## 1. Arquitectura y alcance

`auth-ms` expone el canal TCP en el puerto `3011`. En producción ese canal viaja
**cifrado con TLS** y, además, el servidor exige el **certificado de cliente**
(mTLS): ninguna aplicación sin certificado válido completa el handshake.

```
 CA interna (privada, no se distribuye la clave)
   ├── server.crt  ── auth-ms (servidor TCP 3011)
   ├── app remota.crt ── api-whatsapp (wagent.bponet.com.co)
   └── app local.crt  ── aplicaciones en el mismo servidor de auth-ms
```

Dos niveles de seguridad, complementarios:

| Capa | Qué aporta | Configuración |
|---|---|---|
| **TLS** | Cifrado e integridad del canal; el cliente valida al servidor | `TLS_ENABLED=true` + `ca` en el cliente |
| **mTLS** | Identidad criptográfica del cliente; el servidor valida al cliente | `TLS_MUTUAL=true` en el servidor + `key`/`cert` de cliente |
| **`SERVICE_API_KEY`** | Autenticación de aplicación (se mantiene siempre) | `serviceKey` en cada payload TCP |

### Matriz de escenarios

| Escenario | `USER_MS_HOST` | Puerto | Certificado de cliente | Notas |
|---|---|---|---|---|
| **auth-ms (servidor)** | escucha en `0.0.0.0` | `3011` | `server.key`/`server.crt` | Docker con montaje read-only |
| **App remota** (otro servidor, ej. api-whatsapp) | `app.bponet.com.co` | `3011` | `CN=<app>` | El tráfico cruza internet; TLS obligatorio + firewall por IP |
| **App local en el host** (pm2/systemd) | `127.0.0.1` | `3011` | `CN=<app>` | El SAN del server ya incluye `IP:127.0.0.1` |
| **App local en Docker** (otro contenedor) | `app.bponet.com.co` (recomendado) o nombre del contenedor + `servername` | `3011` | `CN=<app>` | En Docker `127.0.0.1` es el propio contenedor, no el host |

> El certificado del servidor incluye `SAN: DNS:app.bponet.com.co, DNS:localhost, IP:127.0.0.1`.
> El **host con el que el cliente se conecta debe estar en el SAN** (Node valida el nombre por defecto).

---

## 2. Requisitos previos

- OpenSSL disponible en el equipo donde se genera la PKI.
- Acceso SSH a los servidores (`app.bponet.com.co` = auth-ms; `wagent.bponet.com.co` = api-whatsapp).
- Carpetas de certificados en cada servidor: `/opt/cert/apps/...`.
- En auth-ms: Docker + Docker Compose; en api-whatsapp: pm2.

Estructura final:

```
# app.bponet.com.co
/opt/cert/apps/
├── ca/
│   ├── ca.crt                 # copia de la CA (se comparte con los clientes)
│   └── ca.key                 # NO distribuir · custodia offline · chmod 600
├── auth-ms/
│   ├── server.key             # 600
│   ├── server.crt             # SAN: app.bponet.com.co, localhost, 127.0.0.1
│   └── ca.crt
└── <app-local>/
    ├── <app-local>.key        # 600 · CN=<app-local> · clientAuth
    ├── <app-local>.crt
    └── ca.crt

# wagent.bponet.com.co
/opt/cert/apps/api-whatsapp/
├── api-whatsapp.key           # 600 · CN=api-whatsapp · clientAuth
├── api-whatsapp.crt
└── ca.crt
```

---

## 3. Paso 1 — Generar la PKI (CA interna)

Se ejecuta **una sola vez**, en un equipo seguro (o en el servidor de auth-ms si se acepta
custodiar allí la `ca.key`; al terminar, moverla a un almacén seguro).

```bash
mkdir -p pki && cd pki

# ── 3.1 CA interna ─────────────────────────────────────────────
openssl genrsa -out ca.key 4096
openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 \
  -out ca.crt -subj "/CN=BPONet InterService CA"

# ── 3.2 Certificado del servidor (auth-ms) ─────────────────────
cat > server.ext <<'EOF'
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:app.bponet.com.co,DNS:localhost,IP:127.0.0.1
EOF
openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr -subj "/CN=app.bponet.com.co"
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days 825 -sha256 -extfile server.ext

# ── 3.3 Certificado de cliente (una vez por aplicación) ────────
cat > client.ext <<'EOF'
basicConstraints=CA:FALSE
keyUsage=digitalSignature
extendedKeyUsage=clientAuth
EOF

emit_client() {
  APP="$1"
  openssl genrsa -out "$APP.key" 2048
  openssl req -new -key "$APP.key" -out "$APP.csr" -subj "/CN=$APP"
  openssl x509 -req -in "$APP.csr" -CA ca.crt -CAkey ca.key -CAcreateserial \
    -out "$APP.crt" -days 825 -sha256 -extfile client.ext
  chmod 600 "$APP.key"
}

emit_client api-whatsapp
emit_client educative-backend
emit_client crm-campaign-backend
emit_client helpdesk-api
emit_client contratos-backend

# ── 3.4 Verificación ───────────────────────────────────────────
openssl verify -CAfile ca.crt server.crt api-whatsapp.crt
openssl x509 -in server.crt -noout -text | grep -A1 "Subject Alternative Name"
openssl x509 -in api-whatsapp.crt -noout -text | grep -A1 "Extended Key Usage"
openssl x509 -enddate -noout -in server.crt   # anotar vencimiento
chmod 600 ca.key server.key
```

**Relación de confianza:** el servidor valida al cliente con `ca.crt`; el cliente valida al
servidor con el mismo `ca.crt`. Si se emite una CA distinta en cada extremo, el handshake falla.

---

## 4. Paso 2 — Configurar auth-ms (servidor)

### 4.1 Variables de entorno (`.env`)

```ini
TLS_ENABLED=true
TLS_MUTUAL=true
TLS_KEY_PATH=/opt/cert/apps/auth-ms/server.key
TLS_CERT_PATH=/opt/cert/apps/auth-ms/server.crt
TLS_CA_PATH=/opt/cert/apps/auth-ms/ca.crt
MICROSERVICE_HOST=0.0.0.0
MICROSERVICE_PORT=3011
```

> Las rutas son las del **host**, porque el contenedor monta ese mismo directorio (4.2).
> Si falta `server.key`/`server.crt`, el arranque lanza
> `Error: ENOENT ... server.key` y el servicio REST también queda caído (fail-fast).

### 4.2 Docker Compose (montaje de certificados)

`docker-compose.yml`:

```yaml
services:
  nest_app:
    build: .
    container_name: nest_app_auth-ms
    restart: unless-stopped
    ports:
      - "3010:3010"
      - "0.0.0.0:3011:3011"          # IPv4-only
    volumes:
      - /opt/cert/apps/auth-ms:/opt/cert/apps/auth-ms:ro
    env_file:
      - .env
```

### 4.3 Montaje del código (referencia)

`src/main.ts` arma `tlsOptions` y lo pasa a Nest como **`tlsOptions`** (la clave `tls` es ignorada):

```ts
let tlsOptions: any;
if (tlsEnabled) {
  const keyPath  = configService.get<string>('TLS_KEY_PATH');
  const certPath = configService.get<string>('TLS_CERT_PATH');
  const caPath   = configService.get<string>('TLS_CA_PATH');

  if (!keyPath || !certPath) {
    throw new Error('TLS_ENABLED=true requiere TLS_KEY_PATH y TLS_CERT_PATH configurados');
  }

  tlsOptions = {
    key:  fsExtra.readFileSync(keyPath),
    cert: fsExtra.readFileSync(certPath),
    ...(caPath ? { ca: fsExtra.readFileSync(caPath) } : {}),
    requestCert: tlsMutual,          // pide certificado al cliente
    rejectUnauthorized: tlsMutual,   // lo rechaza si no es válido
  };
}

app.connectMicroservice<MicroserviceOptions>(
  {
    transport: Transport.TCP,
    options: {
      host: configService.get('MICROSERVICE_HOST', '0.0.0.0'),
      port: configService.get('MICROSERVICE_PORT', 3011),
      ...(tlsOptions ? { tlsOptions } : {}),
    },
  },
  { inheritAppConfig: true },
);
```

### 4.4 Instalar certificados en el servidor

```bash
sudo mkdir -p /opt/cert/apps/auth-ms
# copiar ca.crt, server.crt y server.key desde la PKI
sudo chown root:root /opt/cert/apps/auth-ms/*
sudo chmod 600 /opt/cert/apps/auth-ms/server.key
sudo chmod 644 /opt/cert/apps/auth-ms/ca.crt /opt/cert/apps/auth-ms/server.crt
sudo restorecon -R /opt/cert/apps 2>/dev/null || true   # SELinux (si aplica)
```

### 4.5 Desplegar

```bash
docker compose build
docker compose up -d
docker ps --filter name=nest_app_auth-ms
docker logs --tail=40 nest_app_auth-ms     # sin errores de certificados
```

El deploy de GitHub Actions valida antes de levantar que existan `server.key`, `server.crt`
y `ca.crt`, y al final que el contenedor quede `running` (si no, imprime los logs y falla).

---

## 5. Paso 3 — Aplicación remota (otro servidor)

Ejemplo real: **api-whatsapp** en `wagent.bponet.com.co`.

### 5.1 Emitir y copiar el certificado

```bash
# En la PKI: emit_client api-whatsapp  (ver 3.3)

# Copiar al servidor remoto
scp ca.crt api-whatsapp.crt api-whatsapp.key USUARIO@wagent.bponet.com.co:~/

# En wagent
sudo mkdir -p /opt/cert/apps/api-whatsapp
sudo mv ~/ca.crt ~/api-whatsapp.crt ~/api-whatsapp.key /opt/cert/apps/api-whatsapp/
sudo chown USUARIO_PM2:USUARIO_PM2 /opt/cert/apps/api-whatsapp/*
sudo chmod 600 /opt/cert/apps/api-whatsapp/api-whatsapp.key
sudo chmod 644 /opt/cert/apps/api-whatsapp/ca.crt /opt/cert/apps/api-whatsapp/api-whatsapp.crt
```

### 5.2 Variables de entorno

```ini
USER_MS_HOST=app.bponet.com.co
USER_MS_PORT=3011
SERVICE_API_KEY=<la misma de auth-ms>
TLS_ENABLED=true
TLS_CA_PATH=/opt/cert/apps/api-whatsapp/ca.crt
TLS_KEY_PATH=/opt/cert/apps/api-whatsapp/api-whatsapp.key
TLS_CERT_PATH=/opt/cert/apps/api-whatsapp/api-whatsapp.crt
```

### 5.3 Módulo cliente Nest (referencia)

```ts
import { readFileSync } from 'fs';

function buildTlsOptions(configService: ConfigService) {
  if (configService.get<string>('TLS_ENABLED') !== 'true') return undefined;

  const tlsOptions: Record<string, Buffer | string> = {};
  const caPath   = configService.get<string>('TLS_CA_PATH');
  const keyPath  = configService.get<string>('TLS_KEY_PATH');
  const certPath = configService.get<string>('TLS_CERT_PATH');

  if (caPath) tlsOptions.ca = readFileSync(caPath);
  if (keyPath && certPath) {
    tlsOptions.key  = readFileSync(keyPath);
    tlsOptions.cert = readFileSync(certPath);
  }
  return tlsOptions;
}

// ClientsModule.registerAsync → options: { host, port, ...(tlsOptions ? { tlsOptions } : {}) }
```

> La opción del cliente también se llama **`tlsOptions`**. Los archivos se leen al arrancar:
> al renovar certificados hay que **reiniciar el proceso** (`pm2 restart <app> --update-env`).

### 5.4 Firewall (solo la IP del cliente remoto)

```bash
# Permitir solo la IP pública de wagent y bloquear el resto (Docker omite ufw)
sudo iptables -I DOCKER-USER -p tcp --dport 3011 -s <IP_WAGENT> -j ACCEPT
sudo iptables -A DOCKER-USER -p tcp --dport 3011 -j DROP
sudo netfilter-persistent save
```

### 5.5 Verificar desde el servidor remoto

```bash
openssl s_client -connect app.bponet.com.co:3011 \
  -CAfile /opt/cert/apps/api-whatsapp/ca.crt \
  -cert   /opt/cert/apps/api-whatsapp/api-whatsapp.crt \
  -key    /opt/cert/apps/api-whatsapp/api-whatsapp.key -brief
# Esperado: Verify return code: 0 (ok)

# Negativa: sin certificado de cliente debe fallar el handshake (mTLS)
openssl s_client -connect app.bponet.com.co:3011 \
  -CAfile /opt/cert/apps/api-whatsapp/ca.crt -brief
```

---

## 6. Paso 4 — Aplicación local (mismo servidor que auth-ms)

Hay dos variantes según cómo corra la aplicación.

### 6.1 En el host (pm2 / systemd / node directo)

Conecta por loopback al puerto publicado:

```ini
USER_MS_HOST=127.0.0.1
USER_MS_PORT=3011
SERVICE_API_KEY=<la misma de auth-ms>
TLS_ENABLED=true
TLS_CA_PATH=/opt/cert/apps/<app>/ca.crt
TLS_KEY_PATH=/opt/cert/apps/<app>/<app>.key
TLS_CERT_PATH=/opt/cert/apps/<app>/<app>.crt
```

El certificado del servidor incluye `IP:127.0.0.1` en el SAN, por lo que la validación
de nombre funciona sin ajustes. Copia e instala el certificado de cliente como en 5.1.

```bash
openssl s_client -connect 127.0.0.1:3011 \
  -CAfile /opt/cert/apps/<app>/ca.crt \
  -cert   /opt/cert/apps/<app>/<app>.crt \
  -key    /opt/cert/apps/<app>/<app>.key -brief
```

### 6.2 En Docker (contenedor en el mismo host)

Dentro de un contenedor, `127.0.0.1` **es el propio contenedor**, no el host. Opciones:

| Opción | `USER_MS_HOST` | Requisito |
|---|---|---|
| A (recomendada) | `app.bponet.com.co` | El tráfico puede resolver por hairpin; el SAN coincide |
| B | IP del gateway Docker (`172.17.0.1`, etc.) | Agregar esa IP al SAN del **certificado del servidor** |
| C | Nombre del contenedor de auth-ms (red compartida) | Añadir `servername: 'app.bponet.com.co'` a `tlsOptions` |

```ts
// Opción C: el host es el nombre del contenedor, pero el certificado se valida
// contra el nombre del SAN indicado en `servername`.
tlsOptions.servername = 'app.bponet.com.co';
```

> Nota de seguridad: el tráfico entre contenedores de la misma red Docker **no pasa por el
> firewall del host** (`DOCKER-USER`). En ese caso, el control de acceso real es TLS + mTLS
> (el certificado de cliente), no la regla de iptables.

### 6.3 Checklist local

1. Emitir el certificado de cliente con `CN=<nombre-app>` (3.3).
2. Copiarlo a `/opt/cert/apps/<app>/` con permisos `600`/`644`.
3. Configurar `USER_MS_HOST`/`USER_MS_PORT` y los `TLS_*` según 6.1 o 6.2.
4. Reiniciar la aplicación y verificar con `openssl s_client`.
5. Probar un comando funcional (`validateSession` / `getTenantConfig`) desde la app.

---

## 7. Orden de activación y rollback

Activación (ventana única, si se parte de TLS deshabilitado):

1. Certificados instalados en auth-ms y en cada cliente (TLS aún en `false`).
2. auth-ms: `TLS_ENABLED=true` (+ `TLS_MUTUAL=true`) y reinicio.
3. Clientes: `TLS_ENABLED=true` y reinicio (inmediatamente después).
4. Verificar con `openssl s_client` y una llamada funcional.
5. Aplicar el firewall por IP.

Rollback: `TLS_ENABLED=false` en auth-ms y clientes + reiniciar. Los certificados quedan montados.

> El puerto `3011` no puede hablar TLS y texto plano a la vez. Si hay consumidores que aún
> no migran, usar un puerto transitorio adicional hasta completar la migración.

---

## 8. Rotación de certificados

- **Vigencia:** servidor y clientes 825 días; CA 3650 días. Anotar vencimientos:
  `openssl x509 -enddate -noout -in <archivo>.crt`.
- **Renovación anticipada:** emitir 30 días antes con los mismos SAN/CN.
- **Procedimiento:**
  1. Generar los nuevos `key`/`csr` y firmarlos con la CA.
  2. Reemplazar los archivos en `/opt/cert/apps/...` (sin borrar los viejos hasta validar).
  3. Reiniciar **auth-ms** y luego cada cliente (los certificados se leen al arrancar).
  4. Verificar con `openssl s_client`.
- **Rotación de la CA** (si se compromete `ca.key`): emitir una CA nueva, redistribuir
  `ca.crt` + certificados nuevos a todos los extremos y reiniciar.
- Nunca subir claves privadas al repositorio; mantener `600` y dueño del proceso.

---

## 9. Troubleshooting

| Síntoma | Causa | Solución |
|---|---|---|
| `ENOENT ... server.key` al arrancar auth-ms (contenedor `Exited (1)`) | Certs no montados o rutas del `.env` distintas al mount | Montar `/opt/cert/apps/auth-ms:/opt/cert/apps/auth-ms:ro` y usar esas mismas rutas en `TLS_*` |
| `UNABLE_TO_VERIFY_LEAF_SIGNATURE` / `SELF_SIGNED_CERT_IN_CHAIN` | Cliente sin el `ca.crt` de la CA interna | Configurar `TLS_CA_PATH` con el `ca.crt` correcto |
| `ERR_TLS_CERT_ALTNAME_INVALID` | El host usado no está en el SAN del certificado | Conectar por `app.bponet.com.co` / `127.0.0.1` según el SAN, o usar `servername` |
| La conexión se resetea al instante (sin 401) | mTLS activo y el cliente no presenta certificado | Configurar `TLS_KEY_PATH` y `TLS_CERT_PATH` |
| `401 Invalid service credentials` | Certificado OK pero `serviceKey` ausente o distinto | Revisar `SERVICE_API_KEY` en el payload (no en headers) |
| Dejó de funcionar tras renovar | El proceso conserva el certificado viejo (se lee al arrancar) | Reiniciar auth-ms y los clientes |
| Todo funciona en local pero no entre servidores | Firewall bloqueando 3011 | Permitir solo la IP del cliente en `DOCKER-USER` |

---

## 10. Referencias

| Archivo | Contenido |
|---|---|
| `plans/ESTRATEGIA_SEGURIDAD_TCP.md` | Estrategia completa F1–F4 del canal TCP |
| `guias/GUIA_INTEGRACION_APIS_EXTERNAS.html` | Guía de integración (incluye TLS para consumidores) |
| `docker-compose.yml` | Montaje de certificados y publicación del puerto |
| `.github/workflows/deploy.yml` | Validación de certificados y salud tras el deploy |
| `src/main.ts` | Construcción de `tlsOptions` del servidor |
