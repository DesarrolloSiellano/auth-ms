# Seguridad de Red — Servidor bponet (srv837776)

Fecha de aplicación: 2026-10-09

Documento de referencia de la configuración de tráfico de red aplicada al servidor,
los cambios realizados por fases y cómo ampliar el acceso (allowlist) en el futuro.

---

## 1. Estado final de la configuración

### Datos del servidor

| Item | Valor |
|---|---|
| Hostname | `srv837776` |
| IPv4 pública | `72.60.151.246/24` (eth0) |
| IPv6 pública | `2a02:4780:66:e36e::1/48` (eth0) |
| Gateway IPv4 | `72.60.151.254` |
| Sistema | Ubuntu 24.04.5 LTS (kernel 6.8.0-117) |
| Forwarding IPv4 | habilitado (Docker) |

### Redes Docker activas

| Red | Bridge | Subred | Estado |
|---|---|---|---|
| `mongo-express_mongo_net` | `br-50a616f1d934` | `172.20.0.0/16` | Activa (contenedores en ejecución) |
| `bridge` (docker0) | `docker0` | `172.16.0.0/24` | Activa (sin usar) |
| `n8n_default` | `br-b2c843833e9a` | `172.18.0.0/16` | Caída |
| `mongo-express_default` | `br-c97f1248f672` | `172.19.0.0/16` | Caída |
| `document-storage-rust_default` | `br-72d394a56eee` | `172.21.0.0/16` | Caída |

Contenedores en ejecución (todos en `mongo-express_mongo_net`):

| Contenedor | IP en la red | Puertos publicados |
|---|---|---|
| `mongodb` | `172.20.0.2` | `127.0.0.1:27017->27017` (solo local) |
| `nest_app_auth-ms` | `172.20.0.3` | `3010`, `3011` (3011 = microservicio TCP NestJS) |
| `mongo-express` | `172.20.0.4` | `127.0.0.1:8082->8081` (solo local) |
| `nest_app_educative_backend` | `172.20.0.5` | `3001` |
| `helpdesk_api_backend` | `172.20.0.6` | `3022` |

### Cadena `DOCKER-USER` final (IPv4)

```text
-A DOCKER-USER -i br-+  -j RETURN                                 # inter-contenedor (ruteado) + salida de contenedores
-A DOCKER-USER -i docker0 -j RETURN                                # idem red docker0
-A DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN # respuestas de conexiones establecidas
-A DOCKER-USER -s 158.69.223.186/32 -d 172.20.0.3/32 -p tcp --dport 3011 -j RETURN  # ALLOWLIST 3011
-A DOCKER-USER -i eth0 -j DROP                                     # cierra el bypass: DROP al resto que entra por eth0
-A DOCKER-USER -j RETURN                                           # resto (local/loopback)
```

Origen `158.69.223.186` = `wagent.bponet.com.co` (vps-cb58b9fa.vps.ovh.ca), cliente remoto autorizado al `3011`.

### Firewall UFW — puertos permitidos entrantes (v4 y v6)

| Puerto | Servicio |
|---|---|
| `22` | SSH |
| `80` | HTTP (nginx) |
| `443` | HTTPS (nginx) |
| `8081` | Servicio de aplicación (host) |

### fail2ban

- Jail: `sshd`, `backend=systemd`, `bantime=1h`, `findtime=10m`, `maxretry=5`.
- Banea las IPs que superan `maxretry` intentos de login fallidos en SSH.
- Ver estado: `fail2ban-client status sshd`.

---

## 2. Diagnóstico inicial

- **Bypass de Docker sobre UFW:** los puertos publicados por Docker se aceptan en `filter/FORWARD`
  (cadenas `DOCKER-USER`/`DOCKER-FORWARD`/`DOCKER`) **antes** que las cadenas `ufw-*`. Por eso
  reglas UFW no controlaban el tráfico hacia contenedores.
- Puertos publicados en `0.0.0.0` y accesibles desde Internet por el bypass: `3001`, `3010`, `3011`, `3022`.
- `27017` (MongoDB) y `8082` (mongo-express) bindeados solo a `127.0.0.1` (reglas UFW engañosas).
- Reglas UFW sin proceso escuchando: `2011`, `2100`, `2101`.
- SSH sin protección anti-fuerza bruta (50k+ hits en `:22`) y sin `fail2ban`.
- `DOCKER-USER` vacía (sin control).

---

## 3. Fase 1 — Allowlist del puerto 3011

Objetivo: solo el servidor remoto `158.69.223.186` puede recibir tráfico hacia el puerto `3011`
del contenedor `auth-ms` (`172.20.0.3`). El resto debe ser descartado (DROP).

Solución: como UFW no ve el tráfico hacia contenedores, se filtra en la cadena `DOCKER-USER`,
que es el punto de enganche oficial que Docker deja al usuario y que se procesa **antes** del `ACCEPT`.

Siendo el `3011` un **microservicio TCP de NestJS** (`MICROSERVICE_PORT=3011`), no responde a HTTP;
por eso `curl` da error incluso en local. Es un comportamiento normal, no del firewall.

Regla añadida (en `DOCKER-USER`):

```text
-A DOCKER-USER -s 158.69.223.186/32 -d 172.20.0.3/32 -p tcp --dport 3011 -j RETURN
```

---

## 4. Fase 2 — Cierre del bypass de Docker

Objetivo: que el tráfico entrante de Internet hacia los contenedores respete la política de firewall,
permitiendo a la vez el tráfico local entre contenedores y la salida a Internet.

Persistencia: todo se definió en `/etc/ufw/after.rules` (UFW lo aplica en cada `ufw reload` y al arrancar).

Bloque añadido al final de `/etc/ufw/after.rules`:

```text
# BEGIN DOCKER BYPASS CONTROL
*filter
:DOCKER-USER - [0:0]
# A) Inter-contenedor (ruteado) + salida de contenedores, todos los protocolos
-A DOCKER-USER -i br-+ -j RETURN
-A DOCKER-USER -i docker0 -j RETURN
# B) Respuestas de conexiones ya establecidas
-A DOCKER-USER -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
# C) Allowlist: 3011 solo desde el agente wagent.bponet.com.co
-A DOCKER-USER -d 172.20.0.3/32 -p tcp --dport 3011 -s 158.69.223.186/32 -j RETURN
# D) Cerrar bypass: DROP a todo lo demas entrante por eth0 hacia contenedores
-A DOCKER-USER -i eth0 -j DROP
# E) Resto (local/loopback no entrante por eth0)
-A DOCKER-USER -j RETURN
COMMIT
# END DOCKER BYPASS CONTROL
```

Explicación línea por línea:

| Regla | Efecto |
|---|---|
| `-i br-+  -j RETURN` (y `docker0`) | El tráfico que **sale de un contenedor** (inter-contenedor ruteado o hacia Internet) se deja pasar. El mismo bridge (L2) no pasa por FORWARD, así que ya funciona. |
| `--ctstate ESTABLISHED,RELATED` `RETURN` | Permite respuestas de conexiones ya abiertas. |
| `-s 158.69.223.186 -d 172.20.0.3 --dport 3011` `RETURN` | Allowlist del `3011` (Fase 1) — se deja pasar antes del DROP. |
| `-i eth0  -j DROP` | Todo lo demás que **entra por Internet** hacia contenedores se descarta. Esto cierra el bypass: `3001`, `3010`, `3022` y futuros puertos publicados dejan de ser accesibles desde afuera. |
| `-j RETURN` final | No afecta al resto del tráfico (local/loopback). |

Consecuencias verificadas:

- Inter-contenedor (ej. `mongo-express -> mongodb:27017`): OK.
- Salida de contenedores a Internet (ej. `https://google.com`): OK.
- nginx proxya por `localhost` (no pasa por FORWARD): OK.
- `3001/3010/3022` ya **no** son accesibles desde Internet (DROP por `eth0`).
- `3011` accesible **solo** desde `158.69.223.186`.

---

## 5. Fase 3 — Limpieza UFW + fail2ban

### Reglas UFW eliminadas

```text
ufw delete allow 3010/tcp
ufw delete allow 3022/tcp
ufw delete allow 8082/tcp
ufw delete allow 27017/tcp
ufw delete allow 2011/tcp
ufw delete allow 2100/tcp
ufw delete allow 2101/tcp
```

Quedaron únicamente `22, 80, 443, 8081` (v4 y v6).

### fail2ban

```bash
apt-get install -y fail2ban python3-systemd
```

`/etc/fail2ban/jail.local`:

```ini
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
backend = systemd

[sshd]
enabled = true
port = ssh
```

Servicio:

```bash
systemctl enable fail2ban
systemctl start fail2ban
```

Nota: Ubuntu ejecuta SSH como `ssh.service`, pero el filtro detecta por `_COMM=sshd`, así que
funciona sin modificar nada (validado con `fail2ban-regex systemd-journal`).

---

## 6. Cómo agregar más IPs al allowlist del puerto 3011

La allowlist vive en la cadena `DOCKER-USER`, que persiste vía `/etc/ufw/after.rules`.
Hay dos formas: persistente (recomendada) y en caliente (temporal).

### Opción A — Persistente (recomendada)

1. Editar `/etc/ufw/after.rules` con `nano`:

   ```bash
   nano /etc/ufw/after.rules
   ```

2. Localizar el bloque `# BEGIN DOCKER BYPASS CONTROL`. Debajo de la regla (C) existente
   (la del `158.69.223.186`) y **siempre antes de la regla `DROP` (`-i eth0 -j DROP`)**,
   añadir una línea por cada IP nueva:

   ```text
   -A DOCKER-USER -d 172.20.0.3/32 -p tcp --dport 3011 -s <NUEVA_IP>/32 -j RETURN
   ```

   Ejemplo (IP de oficina `198.51.100.44`):

   ```text
   -A DOCKER-USER -d 172.20.0.3/32 -p tcp --dport 3011 -s 198.51.100.44/32 -j RETURN
   ```

   Se admiten CIDRs (ej. `203.0.113.0/24`).

3. Aplicar el cambio:

   ```bash
   ufw reload
   ```

4. Verificar:

   ```bash
   iptables -S DOCKER-USER
   ```

### Opción B — En caliente (temporal, se pierde con `ufw reload` o reinicio)

```bash
iptables -I DOCKER-USER 4 -d 172.20.0.3/32 -p tcp --dport 3011 -s <NUEVA_IP>/32 -j RETURN
```

El `4` inserta la regla en la posición 4 (después de las reglas A, A-docker0 y B, antes del DROP).
Verificable con `iptables -S DOCKER-USER`.

### Reglas de oro

- Las nuevas reglas de permiso **deben ir antes** de `-A DOCKER-USER -i eth0 -j DROP`.
- Si el contenedor `auth-ms` cambia de IP en la red Docker, actualizar `172.20.0.3` en todas
  las reglas (`docker inspect nest_app_auth-ms | grep IPAddress`).
- Bloques de IPs grandes (CIDR amplios) reducen la seguridad; úsalos solo si es necesario.

### Quitar una IP

```bash
# en /etc/ufw/after.rules
ufw reload
# o en caliente (ajustar nº de regla):
iptables -D DOCKER-USER <numero>   # ver con iptables -S DOCKER-USER --line-numbers
```

---

## 7. Rollback / deshacer

- **Quitar TODO el control del bypass:** borrar el bloque `BEGIN/END DOCKER BYPASS CONTROL`
  de `/etc/ufw/after.rules` y ejecutar `ufw reload`.
- **En caliente (sin persistir):** `iptables -F DOCKER-USER`.
- **Backup de UFW:** `/etc/ufw/after.rules.bak.20261009220605`.

---

## 8. Verificaciones y pendientes

### Verificaciones realizadas

- Inter-contenedor TCP (`mongo-express -> mongodb:27017`, `auth-ms -> mongodb`): OK.
- TCP a `172.20.0.3:3011` desde otro contenedor: OK.
- Salida a Internet desde contenedor: OK.
- nginx (`auth.bponet.com.co`, proxy `localhost:3010`): OK.
- `ufw reload` no rompe las reglas de `DOCKER-USER`: OK.
- fail2ban detecta `Invalid user` / `Failed password` del journal: OK.

### Pendientes

- **SSH sin endurecer** (por indicación explícita). Estado actual:
  `PermitRootLogin yes`, `PasswordAuthentication yes` y **cero claves públicas instaladas**
  (`/root/.ssh/authorized_keys` vacío, `ubuntu` sin claves).
  Antes de endurecer (desactivar contraseña/root) hay que instalar al menos una clave pública.
- Puertos Docker publicados `3001`, `3010`, `3022` quedaron bloqueados desde Internet; si en el
  futuro se requiere acceso directo, crear una allowlist en `DOCKER-USER` igual que el `3011`.
- Bridges Docker caídos sin limpiar (`n8n_default`, `mongo-express_default`,
  `document-storage-rust_default`).

---

### Comandos útiles

```bash
# Estado del firewall y de la cadena Docker
ufw status verbose
iptables -S DOCKER-USER
iptables -v -L DOCKER-USER

# fail2ban
fail2ban-client status sshd
fail2ban-client set sshd unbanip <IP>

# Test desde la IP autorizada (cliente remoto)
nc -vz 72.60.151.246 3011
