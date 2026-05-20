# FreeCast Hub — Guía de Deploy en Servidor Propio

Este documento cubre el deploy completo de **FreeCast Hub** en un VPS o servidor propio, la configuración del subdominio con DNS, HTTPS con Nginx como reverse proxy, y cómo conectar el cliente macOS.

---

## Índice

1. [Requisitos](#1-requisitos)
2. [Registros DNS para el subdominio](#2-registros-dns-para-el-subdominio)
3. [Preparar el servidor](#3-preparar-el-servidor)
4. [Deploy del Hub](#4-deploy-del-hub)
5. [Nginx como reverse proxy + HTTPS](#5-nginx-como-reverse-proxy--https)
6. [Configurar como servicio (systemd)](#6-configurar-como-servicio-systemd)
7. [Verificar que el Hub está funcionando](#7-verificar-que-el-hub-está-funcionando)
8. [Conectar el cliente macOS](#8-conectar-el-cliente-macos)
9. [Variables de entorno — referencia completa](#9-variables-de-entorno--referencia-completa)
10. [Actualizar el Hub](#10-actualizar-el-hub)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Requisitos

### En el servidor

- Linux (Ubuntu 22.04 / Debian 12 o posterior recomendado)
- **Node.js 20+** (`node --version` debe devolver `v20.x.x` o superior)
- **npm 10+**
- **Git**
- **Nginx** (para reverse proxy y HTTPS)
- **Certbot** (para certificado SSL gratuito con Let's Encrypt)
- Puerto **80** y **443** abiertos en el firewall
- Acceso SSH con sudo

### En tu máquina

- FreeCastNotes instalado
- El repositorio clonado localmente

---

## 2. Registros DNS para el subdominio

Antes de tocar el servidor, configura el DNS. El Hub va a vivir en algo como `notes.tudominio.com`.

### Dónde hacerlo

Entra al panel de tu registrador de dominio (Namecheap, Cloudflare, GoDaddy, etc.) y buscá la sección **DNS Management** o **Zone Editor**.

### Qué crear

Agregá un registro de tipo **A** apuntando al IP público de tu servidor:

| Tipo | Nombre (Host)     | Valor (Points to)  | TTL  |
|------|-------------------|--------------------|------|
| A    | `notes`           | `123.45.67.89`     | 3600 |

- **Tipo**: `A` (address record, IPv4)
- **Nombre**: el subdominio que quieras — por ejemplo `notes`, `hub`, `n`, lo que prefieras
- **Valor**: la IP pública de tu servidor (la encontrás en el panel de tu VPS)
- **TTL**: 3600 segundos está bien; podés poner 300 si querés propagación más rápida al principio

Si tu servidor tiene IPv6 y querés soporte dual-stack, agregá también un registro **AAAA**:

| Tipo | Nombre  | Valor (IPv6)           | TTL  |
|------|---------|------------------------|------|
| AAAA | `notes` | `2001:db8::1`          | 3600 |

### Si usás Cloudflare

Si el dominio pasa por Cloudflare, podés activar el proxy (nube naranja) para proteger la IP real del servidor. El proceso DNS es el mismo; solo marcá el toggle "Proxied". Certbot en ese caso funciona con el challenge DNS en vez del HTTP-01 — lo más simple es apagar temporalmente el proxy (nube gris) durante la emisión del certificado y reactivarlo después.

### Verificar propagación

Desde tu máquina local:

```bash
# Puede tardar entre 1 minuto y 1 hora dependiendo del TTL anterior
dig notes.tudominio.com A +short
# Debe devolver la IP de tu servidor
```

O con `nslookup`:

```bash
nslookup notes.tudominio.com
```

No sigas hasta que el DNS resuelva correctamente.

---

## 3. Preparar el servidor

Conectate por SSH:

```bash
ssh usuario@notes.tudominio.com
```

### Instalar Node.js 20+ (via nvm, recomendado)

```bash
# Instalar nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc   # o ~/.zshrc si usás zsh

# Instalar y activar Node.js 20
nvm install 20
nvm use 20
nvm alias default 20

# Verificar
node --version   # v20.x.x
npm --version    # 10.x.x
```

Alternativa con apt (Ubuntu/Debian):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Instalar Nginx y Certbot

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

### Crear usuario de sistema para el Hub (buena práctica)

```bash
sudo useradd --system --shell /bin/bash --create-home freecast
```

---

## 4. Deploy del Hub

### Clonar el repositorio

```bash
sudo -u freecast bash   # trabajamos como el usuario del servicio
cd /home/freecast
git clone https://github.com/TU_USUARIO/FreeCastNotes.git app
cd app/sync-hub
```

Si el repositorio es privado, usá un deploy key o un access token:

```bash
git clone https://TU_TOKEN@github.com/TU_USUARIO/FreeCastNotes.git app
```

### Instalar dependencias

```bash
cd /home/freecast/app/sync-hub
npm install --omit=dev
```

### Construir el web editor (para notas con edición web habilitada)

```bash
npm run build:web
```

Esto compila la SPA de TipTap en `web/dist/`. Si no necesitás el editor web por ahora, podés omitir este paso (las notas se sirven igualmente como HTML renderizado en el servidor).

### Crear el directorio de datos

```bash
sudo mkdir -p /var/lib/freecast-hub
sudo chown freecast:freecast /var/lib/freecast-hub
```

### Crear el archivo de entorno

```bash
# Salir del shell de freecast si entraste con sudo -u
exit

# Crear el archivo como root y asignar al usuario
sudo nano /etc/freecast-hub.env
```

Contenido del archivo (ajustá los valores):

```env
# Puerto interno — Nginx hace de proxy, nunca expongas este puerto directamente
SYNC_PORT=8787

# Token de autenticación — CAMBIALO por algo seguro (mínimo 32 caracteres)
# Generá uno con: openssl rand -hex 32
SYNC_TOKEN=pon_aqui_un_token_muy_secreto_de_32_chars_o_mas

# Directorio donde se guardan notas y base de datos SQLite
SYNC_DATA_ROOT=/var/lib/freecast-hub

# URL pública del Hub — se usa para construir links a notas publicadas
HUB_BASE_URL=https://notes.tudominio.com

# Límite de tamaño de nota (MB) — opcional, default 10
SYNC_BODY_LIMIT_MB=10

# Nivel de logs: info | warn | error | debug
# LOG_LEVEL=info
```

Protegé el archivo para que solo root y el usuario del servicio puedan leerlo:

```bash
sudo chmod 640 /etc/freecast-hub.env
sudo chown root:freecast /etc/freecast-hub.env
```

**Generar un token seguro:**

```bash
openssl rand -hex 32
# Ejemplo de salida: a3f8d2c1e5b7...
# Copiá ese valor en SYNC_TOKEN
```

---

## 5. Nginx como reverse proxy + HTTPS

### Crear el config de Nginx

```bash
sudo nano /etc/nginx/sites-available/freecast-hub
```

Pegá esto (reemplazá `notes.tudominio.com`):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name notes.tudominio.com;

    # Certbot va a modificar este bloque automáticamente
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name notes.tudominio.com;

    # Certbot completa estos paths
    ssl_certificate     /etc/letsencrypt/live/notes.tudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/notes.tudominio.com/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # Tamaño máximo de body — debe coincidir con SYNC_BODY_LIMIT_MB
    client_max_body_size 12M;

    # Headers de seguridad
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        proxy_pass         http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

### Activar el sitio

```bash
sudo ln -s /etc/nginx/sites-available/freecast-hub /etc/nginx/sites-enabled/
sudo nginx -t           # verificar que no hay errores de sintaxis
sudo systemctl reload nginx
```

### Obtener el certificado SSL con Let's Encrypt

```bash
sudo certbot --nginx -d notes.tudominio.com
```

Certbot te va a preguntar tu email (para avisos de renovación) y si querés redirigir HTTP → HTTPS (respondé sí). Va a modificar automáticamente el config de Nginx con los paths del certificado.

Verificá que la renovación automática funciona:

```bash
sudo certbot renew --dry-run
```

---

## 6. Configurar como servicio (systemd)

Esto hace que el Hub arranque automáticamente al reiniciar el servidor y se reinicie si falla.

```bash
sudo nano /etc/systemd/system/freecast-hub.service
```

Contenido:

```ini
[Unit]
Description=FreeCast Hub
Documentation=https://github.com/TU_USUARIO/FreeCastNotes
After=network.target

[Service]
Type=simple
User=freecast
Group=freecast
WorkingDirectory=/home/freecast/app/sync-hub
EnvironmentFile=/etc/freecast-hub.env
ExecStart=/home/freecast/.nvm/versions/node/v20.19.0/bin/node src/index.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=freecast-hub

# Límites de seguridad
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ReadWritePaths=/var/lib/freecast-hub /home/freecast/app/sync-hub/web/dist

[Install]
WantedBy=multi-user.target
```

> **Nota sobre la ruta de node**: ajustá `/home/freecast/.nvm/versions/node/v20.19.0/bin/node` a la versión exacta que instalaste. Verificá con `sudo -u freecast bash -c "which node"` o usá la ruta absoluta que devuelva.

Si instalaste Node con `apt` en vez de nvm, la ruta es simplemente `/usr/bin/node`.

### Activar y arrancar

```bash
sudo systemctl daemon-reload
sudo systemctl enable freecast-hub
sudo systemctl start freecast-hub

# Ver estado
sudo systemctl status freecast-hub
```

### Ver logs en tiempo real

```bash
sudo journalctl -u freecast-hub -f
```

---

## 7. Verificar que el Hub está funcionando

### Health check

```bash
curl https://notes.tudominio.com/health
```

Respuesta esperada:

```json
{
  "ok": true,
  "service": "freecast-sync-hub",
  "version": "0.1.0",
  "time": "2026-05-20T12:00:00.000Z"
}
```

### Verificar autenticación

```bash
# Sin token — debe devolver 401
curl -s https://notes.tudominio.com/sync/state?workspaceId=test\&deviceId=test

# Con token — debe devolver JSON de estado
curl -s -H "Authorization: Bearer TU_SYNC_TOKEN" \
  "https://notes.tudominio.com/sync/state?workspaceId=test&deviceId=test"
```

Si el health check responde pero el sync devuelve 500, revisá que `SYNC_TOKEN` está configurado en el `.env`.

---

## 8. Conectar el cliente macOS

Una vez que el Hub está corriendo con HTTPS, abrís FreeCastNotes en tu Mac y configurás la conexión desde dos lugares:

### 8a. Configurar sincronización (pestaña Sync en Preferencias)

1. Abrí FreeCastNotes → presioná el ícono de preferencias (o el atajo global)
2. Andá a la sección **Sync**
3. Completá los campos:

| Campo            | Valor                                         |
|------------------|-----------------------------------------------|
| **Server URL**   | `https://notes.tudominio.com`                 |
| **Workspace ID** | Un identificador único para tu espacio (ej: `gaston-mac`, `personal`) |
| **Device Name**  | El nombre de esta Mac (ej: `MacBook Pro`)     |
| **API Token**    | El valor que pusiste en `SYNC_TOKEN`          |
| **Direction**    | `Bidirectional` (recomendado)                 |
| **Mode**         | `Auto` (sincroniza automáticamente)           |
| **Interval**     | 60 segundos                                   |

4. Hacé clic en **Test Connection** — debe devolver verde "Connected"
5. Hacé clic en **Save**
6. Hacé clic en **Sync Now** para el primer sync

### 8b. Configurar el Hub para publicación (sección Hub en Preferencias)

La sección **Hub** controla la publicación pública de notas (independiente del sync).

1. En Preferencias → sección **Hub**
2. Completá:

| Campo         | Valor                             |
|---------------|-----------------------------------|
| **Hub URL**   | `https://notes.tudominio.com`     |
| **API Token** | El mismo `SYNC_TOKEN`             |

3. Hacé clic en **Test Connection** — debe aparecer "✓ Connected (Xms)"
4. Hacé clic en **Save**

### 8c. Publicar una nota

Una vez conectado, aparece una barra de visibilidad debajo del editor en cada nota:

- **Private** (default): solo vos podés verla, nunca sale del dispositivo
- **Unlisted**: accesible por link directo, no aparece en el índice público
- **Public**: listada en `https://notes.tudominio.com/api/notes` y accesible por cualquiera

Al cambiar a **Public** o **Unlisted**, FreeCastNotes sincroniza automáticamente con el Hub y la nota queda disponible en:

```
https://notes.tudominio.com/tu-titulo-de-nota
```

El slug se genera del primer H1 de la nota y se guarda en el frontmatter (`published_slug`). Una vez asignado, el slug no cambia aunque modifiques el título.

Para habilitar **edición desde el navegador**, activá el checkbox **"Allow web editing"** (aparece cuando la nota es pública o unlisted). La URL de edición es:

```
https://notes.tudominio.com/tu-titulo-de-nota/edit
```

---

## 9. Variables de entorno — referencia completa

| Variable             | Default         | Descripción                                                |
|----------------------|-----------------|------------------------------------------------------------|
| `SYNC_PORT`          | `8787`          | Puerto en que escucha el proceso Node.js                   |
| `SYNC_TOKEN`         | *(requerido)*   | Bearer token para autenticar el cliente macOS              |
| `SYNC_DATA_ROOT`     | `./data`        | Directorio raíz donde se guardan notas y SQLite            |
| `SYNC_SQLITE_PATH`   | `$DATA/state.sqlite` | Path exacto del archivo SQLite (override)             |
| `HUB_BASE_URL`       | `""`            | URL pública del hub (se incluye en links de notas)         |
| `SYNC_BODY_LIMIT_MB` | `10`            | Tamaño máximo de payload en MB                             |
| `SYNC_HMAC_SECRET`   | `""`            | Si está configurado, valida firma HMAC SHA-256 en pushes   |
| `HOST`               | `0.0.0.0`       | Interfaz de red en que escucha (no cambiar con Nginx)      |
| `LOG_LEVEL`          | `info`          | Nivel de logs: `debug`, `info`, `warn`, `error`            |

---

## 10. Actualizar el Hub

Para deployar una nueva versión:

```bash
# Conectarse al servidor
ssh usuario@notes.tudominio.com
sudo -u freecast bash

# Ir al directorio del proyecto
cd /home/freecast/app

# Bajar los cambios
git pull origin main

# Actualizar dependencias si cambiaron
cd sync-hub
npm install --omit=dev

# Reconstruir el web editor si hubo cambios en sync-hub/web/
npm run build:web

# Salir del shell de freecast
exit

# Reiniciar el servicio
sudo systemctl restart freecast-hub

# Verificar que arrancó bien
sudo systemctl status freecast-hub
curl https://notes.tudominio.com/health
```

---

## 11. Troubleshooting

### El servicio no arranca

```bash
sudo journalctl -u freecast-hub -n 50 --no-pager
```

Causas comunes:
- **`SYNC_TOKEN not configured`**: el archivo `/etc/freecast-hub.env` no se está leyendo. Verificá que `EnvironmentFile=` en el `.service` apunta al path correcto.
- **`Cannot find module`**: falta `npm install`. Ejecutalo como usuario `freecast`.
- **`EADDRINUSE`**: otro proceso está usando el puerto 8787. Cambiá `SYNC_PORT` o terminá el otro proceso.

### Nginx devuelve 502 Bad Gateway

El Hub no está corriendo o no escucha en el puerto correcto:

```bash
sudo systemctl status freecast-hub
curl http://127.0.0.1:8787/health   # bypass Nginx, prueba directa
```

### El cliente dice "Connection failed"

1. Verificá que la URL no tenga barra al final: `https://notes.tudominio.com` (sin `/`)
2. Verificá el token copiando y pegando directamente del archivo `.env`
3. Probá el health check desde tu Mac:
   ```bash
   curl https://notes.tudominio.com/health
   ```
4. Verificá que el puerto 443 está abierto en el firewall del servidor:
   ```bash
   sudo ufw status
   # Debe mostrar: 443 ALLOW
   ```

### Certificado SSL no renueva automáticamente

```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

Si falló porque Nginx estaba caído durante la renovación, reiniciá Nginx y volvé a intentar.

### Las notas publicadas no aparecen

1. Verificá que `HUB_BASE_URL` está configurado en el `.env` del servidor
2. Verificá que la nota tiene `visibility: public` o `unlisted` en su frontmatter (podés ver el `.md` en `SYNC_DATA_ROOT/workspaces/<id>/`)
3. Hacé un "Sync Now" desde Preferencias para forzar el push
4. Consultá el endpoint JSON: `curl https://notes.tudominio.com/api/notes`

### Ver qué notas están publicadas en la base de datos

```bash
sudo -u freecast sqlite3 /var/lib/freecast-hub/state.sqlite \
  "SELECT slug, title, visibility, edit_permission FROM hub_notes;"
```

---

## Estructura de archivos en el servidor

```
/home/freecast/app/sync-hub/     ← código del Hub
/var/lib/freecast-hub/
├── state.sqlite                 ← base de datos SQLite (metadata + hub_notes)
└── workspaces/
    └── <workspaceId>/           ← archivos .md sincronizados
        ├── nota-uno.md
        ├── nota-dos.md
        └── attachments/         ← imágenes y adjuntos
/etc/freecast-hub.env            ← variables de entorno (protegido 640)
/etc/systemd/system/freecast-hub.service
/etc/nginx/sites-available/freecast-hub
/etc/letsencrypt/live/notes.tudominio.com/   ← certificados SSL
```
