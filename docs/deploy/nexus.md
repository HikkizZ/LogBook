# Despliegue de Logbook en Nexus (8.3 y 8.4)

Guía paso a paso para poner Logbook en producción en Nexus siguiendo mi propia convención (`06_nexus_server/arquitectura.md` → "Flujo para agregar un proyecto nuevo"): código en `/srv/apps/logbook`, datos en `/srv/data/logbook`, ruta de nginx en `nexus-infra/proxy/conf.d/`, entrada por el túnel de Cloudflare y Cloudflare Access delante. Requisitos de referencia: RD-01..RD-09 y RS-04/RS-05/RS-15/RS-18 de [[../spec/01_especificacion]]; tareas 8.3 y 8.4 de [[../spec/03_plan_implementacion]]; hallazgos de [[../reviews/fase-8-despliegue]].

Convención: 🖥️ = en Nexus (`ssh nexus` desde PowerShell, usuario `hikki`, con el agente reenviado) · 💻 = en mi PC (PowerShell o Git Bash) · 🌐 = en el panel de Cloudflare. Cada paso dice qué hace, el comando, qué debería ver y cómo verificar antes de seguir. **Ningún valor real va en esta guía**: contraseñas, tokens y hashes se generan en el momento y se guardan en Bitwarden (regla de `secretos_env.md`).

Antes de empezar: aplicar (o descartar por escrito) B-1 y B-2 de la revisión #3 y tener el merge de `fase-8-despliegue` en `main`, porque el servidor clona `main`.

## Índice

0. [Antes de empezar](#0-antes-de-empezar)
1. [Deploy key y clon en `/srv/apps/logbook`](#1-deploy-key-y-clon-en-srvappslogbook)
2. [`.env` de producción](#2-env-de-producción)
3. [Carpeta de datos y primer arranque](#3-carpeta-de-datos-y-primer-arranque)
4. [Ruta en nginx (`nexus-infra`)](#4-ruta-en-nginx-nexus-infra)
5. [Ruta en el túnel de Cloudflare](#5-ruta-en-el-túnel-de-cloudflare)
6. [Cloudflare Access](#6-cloudflare-access)
7. [Verificación final de 8.3](#7-verificación-final-de-83)
8. [8.4 Respaldo diario y prueba de restore](#8-84-respaldo-diario-y-prueba-de-restore)
9. [Actualizar y qué hacer si algo falla](#9-actualizar-y-qué-hacer-si-algo-falla)
10. [Lo que tengo que anotar después (8.5)](#10-lo-que-tengo-que-anotar-después-85)

---

## 0. Antes de empezar

🖥️ Entro a Nexus y confirmo que el estado es el que creo:

```bash
ssh nexus
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker network ls --format 'table {{.Name}}\t{{.Driver}}'
ls -la /srv/apps /srv/data
echo "agente: ${SSH_AUTH_SOCK:-NO}"
```

Debería ver: `nginx-proxy`, `cloudflared`, `portfolio` y `postgres` corriendo; `postgres` con `127.0.0.1:5432->5432/tcp` y los demás sin `0.0.0.0`; redes `web` y `db`; `/srv/apps/portfolio` y `/srv/data/postgres`; `agente:` con una ruta (si dice `NO`, entré desde Termius y el `git push` de `nexus-infra` del paso 4 no va a funcionar: usar `ssh nexus` desde PowerShell).

---

## 1. Deploy key y clon en `/srv/apps/logbook`

**Qué hace**: igual que `nexus-infra`, el servidor baja el código con una llave que solo puede **leer** el repo privado `HikkizZ/LogBook`. Sin passphrase (pull desatendido), con un alias en `~/.ssh/config` para que no se mezcle con la llave de `nexus-infra` ni con la mía reenviada (`git_en_el_servidor.md` → "Autenticación").

### 1.1 Generar la llave 🖥️

```bash
ssh-keygen -t ed25519 -C "deploy-logbook@nexus" -f ~/.ssh/deploy_logbook -N ""
cat ~/.ssh/deploy_logbook.pub
```

Debería ver una sola línea `ssh-ed25519 AAAA... deploy-logbook@nexus`. Esa línea (la **pública**) es la que se copia; `~/.ssh/deploy_logbook` sin `.pub` no sale de Nexus nunca.

### 1.2 Registrarla en GitHub 💻

GitHub → repo `HikkizZ/LogBook` → **Settings → Deploy keys → Add deploy key**. Title `nexus (solo lectura)`, Key = la línea de arriba, **"Allow write access" desmarcado**. Guardar.

### 1.3 Alias en `~/.ssh/config` del servidor 🖥️

```bash
cat >> ~/.ssh/config <<'EOF'

Host github-logbook
    HostName github.com
    User git
    IdentityFile ~/.ssh/deploy_logbook
    IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
ssh -T git@github-logbook
```

Debería ver `Hi HikkizZ/LogBook! You've successfully authenticated, but GitHub does not provide shell access.` Dice el **repo**, no mi usuario: es la deploy key. Si dice `Permission denied`, la llave pública no quedó guardada en el repo correcto o el alias apunta a otro archivo. Verificación cruzada: `ssh -T git@github-nexus-infra` sigue diciendo `Hi HikkizZ/nexus-infra!` (no se mezclaron).

### 1.4 Clonar 🖥️

```bash
git clone git@github-logbook:HikkizZ/LogBook.git /srv/apps/logbook
cd /srv/apps/logbook && git log --oneline -3 && git remote -v
ls -la
```

Debería ver los últimos commits de `main` (incluido el merge de la fase 8), `origin git@github-logbook:HikkizZ/LogBook.git` en fetch **y** push, y en la carpeta `Dockerfile`, `docker-compose.yml`, `.env.example`, `apps/`, `packages/`. No hace falta `set-url --push`: el código no se edita en el servidor; si algún día lo necesito, es el mismo truco de `nexus-infra`. `/srv/apps` ya es de `hikki:hikki` (lo creé con el portafolio), así que el clon es mío sin `sudo`.

Permisos: `chmod 750 /srv/apps/logbook` (convención de `estructura_servidor.md`: app mía, sin grupo).

---

## 2. `.env` de producción

**Qué hace**: un `.env` solo para Logbook en `/srv/apps/logbook/.env`, `chmod 600`, ignorado por git. Compose lo usa dos veces: para interpolar `${POSTGRES_PASSWORD:?}` del compose y como `env_file` del contenedor `logbook`.

### 2.1 Generar los valores

**`POSTGRES_PASSWORD`** 🖥️ (aleatoria, en hexadecimal para que no necesite escaparse dentro de la URL):

```bash
openssl rand -hex 24
```

**`TRUST_PROXY`** 🖥️ (subred real de la red `web`; es lo que hace que el rate limit vea la IP del visitante y no la de `cloudflared`, §3 de la revisión):

```bash
docker network inspect web --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'
```

Debería ver algo como `172.18.0.0/16` (en el vault, `cloudflared` es `172.18.0.3`, así que lo normal es ese). Copio exactamente lo que imprime.

**`ADMIN_PASSWORD_HASH`** 💻 — la contraseña de la UI, guardada como hash argon2id (RS-02). Dos formas:

- **Recomendada: en el PC**, con el script del repo:
  ```powershell
  cd C:\Users\fmira\Projects\LogBook-Zytech
  pnpm --filter api hash-password
  ```
  Pide `Contraseña:` sin eco y escribe el hash en pantalla (`$argon2id$v=19$m=65536,p=4,t=3$...`). La contraseña la invento ahí mismo y la guardo en Bitwarden (es la que escribiré en el login de la app). Por qué esta: no hay dependencia de orden (en Nexus el `docker compose build` ya exige `POSTGRES_PASSWORD` en el `.env`), la contraseña nunca sale del teclado y el hash **no es un secreto** del mismo nivel que la contraseña (está diseñado para vivir en el `.env`; igual lo copio por la sesión SSH, que va cifrada, y no por chats).
- Alternativa, dentro de la imagen en Nexus, después del `docker compose build` del paso 3 (misma versión de argon2 que verificará el login; útil si no tengo el repo a mano): `docker run --rm -it logbook-logbook node dist/scripts/hash-password.js`.

Formato esperado: empieza por `$argon2id$v=19$m=65536` (la API se niega a arrancar si `m < 19456`, RS-02).

### 2.2 Escribir el archivo 🖥️

```bash
cd /srv/apps/logbook
cp .env.example .env && chmod 600 .env
nano .env
```

Dejar así (valores de ejemplo con la **forma**, no reales):

```
DATABASE_URL=postgres://logbook:<POSTGRES_PASSWORD>@db:5432/logbook
POSTGRES_PASSWORD=<los 48 hex de openssl>
ADMIN_PASSWORD_HASH='$argon2id$v=19$m=65536,p=4,t=3$...$...'
APP_ORIGIN=https://logbook.zytech.dev
APP_TIMEZONE=America/Santiago
PORT=3000
TRUST_PROXY=<subred de web, p. ej. 172.18.0.0/16>
NODE_ENV=production
WEB_DIST_DIR=/app/web
GITHUB_WEBHOOK_SECRET=
```

Reglas que no se negocian:
- El hash **entre comillas simples** y nada más entre comillas. Sin ellas, Compose interpreta `$argon2id` como una variable vacía y la app no arranca (fallo seguro, pero fallo).
- La misma contraseña en `DATABASE_URL` y en `POSTGRES_PASSWORD`; `POSTGRES_PASSWORD` solo se aplica la **primera** vez que se crea la base (`postgres_en_docker.md`): si después la cambio en el `.env`, hay que cambiarla también con `ALTER ROLE`.
- `APP_ORIGIN` sin barra final.

### 2.3 Verificar antes de seguir 🖥️

```bash
ls -l .env                                   # -rw------- 1 hikki hikki
git check-ignore -v .env                     # debe responder: .gitignore:4:.env  .env
git status --short                           # vacío: nada que commitear
docker compose config --quiet && echo "YAML OK"
docker compose config | grep -E 'ADMIN_PASSWORD_HASH|TRUST_PROXY|ports'
```

Debería ver `ADMIN_PASSWORD_HASH: $$argon2id$$v=19...` (los `$$` son cómo `config` **muestra** un `$` literal: significa que llegó entero), `TRUST_PROXY:` con la subred y **ninguna** línea `ports`. Si `git check-ignore` no responde nada, parar: el `.env` se subiría con el próximo `git add` (lección de `git_en_el_servidor.md`).

Guardar el `.env` completo en Bitwarden como nota segura `logbook .env (Nexus)`.

---

## 3. Carpeta de datos y primer arranque

**Qué hace**: crea `/srv/data/logbook/` (datos persistentes, sin git), construye la imagen en Nexus y levanta `db` + `logbook`. Las migraciones corren solas al arrancar (RD-04).

### 3.1 Carpetas 🖥️

```bash
sudo mkdir -p /srv/data/logbook/postgres /srv/data/logbook/backups
sudo chown -R hikki:hikki /srv/data/logbook
chmod 700 /srv/data/logbook /srv/data/logbook/backups
ls -la /srv/data/logbook
```

`postgres/` queda vacía y mía; el entrypoint de la imagen (que arranca como root y luego baja a `postgres`) creará `18/docker/` con dueño uid 70 y permisos 700, exactamente como pasó con `/srv/data/postgres` del Postgres de pruebas. No hay que hacer `chown 70` a mano. `backups/` sí queda mía (700): ahí escribe el cron del paso 8.

### 3.2 Levantar 🖥️

```bash
cd /srv/apps/logbook
docker compose up -d --build
```

Tarda unos minutos la primera vez (instala dependencias y compila web + api dentro del build). Al final: `Network logbook_logbook_internal Created`, `Container logbook-db Healthy`, `Container logbook Started`. Compose usa el nombre de la carpeta como proyecto: la imagen se llama `logbook-logbook` y la red interna `logbook_logbook_internal`.

### 3.3 Verificar 🖥️

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'NAMES|logbook'
docker compose logs logbook --tail 30
```

Debería ver:
- `logbook-db` → `Up ... (healthy)` con `5432/tcp` **sin** `0.0.0.0`; `logbook` → `Up ... (healthy)` tras ~30 s (el `start_period`) con `3000/tcp`.
- En los logs, en este orden: `Migraciones ejecutadas: InitialSchema1760918400000` (solo la primera vez; después `ninguna`), luego una línea JSON de pino con `"msg":"API escuchando","port":3000` y `sesiones purgadas`. **No** debe aparecer el `warn` de `TRUST_PROXY vacío` ni un `fatal` de `Falta la variable` / hash inválido / zona horaria.

Salud desde dentro de la red `web`, simulando lo que hará nginx:

```bash
docker exec nginx-proxy wget -qO- http://logbook:3000/api/v1/health; echo
docker exec nginx-proxy wget -qS -O /dev/null http://logbook:3000/ 2>&1 | grep -iE 'HTTP/|content-security-policy|cache-control'
docker inspect logbook-db --format 'ports={{.NetworkSettings.Ports}} redes={{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
docker inspect logbook --format '{{.HostConfig.LogConfig}}'
```

Debería ver `{"ok":true,"db":true}`; `HTTP/1.1 200 OK` con la CSP de RS-08 y `Cache-Control: no-cache` en el HTML; `ports=map[]` y solo la red `logbook_logbook_internal` en `db`; `{json-file map[max-file:3 max-size:10m]}` (hereda el límite de `daemon.json`). Si apliqué B-1 (`internal: true`): `docker exec logbook-db wget -q -T 3 -O /dev/null http://1.1.1.1; echo $?` → distinto de 0.

Si `logbook` queda en `Restarting`: `docker compose logs logbook --tail 50`. Las causas típicas son el hash sin comillas (`ADMIN_PASSWORD_HASH` inválido), `DATABASE_URL` con otra contraseña que `POSTGRES_PASSWORD` (`password authentication failed`) o `APP_TIMEZONE` mal escrita. Se corrige el `.env` y `docker compose up -d` (recrea solo `logbook`; `db` no se toca).

---

## 4. Ruta en nginx (`nexus-infra`)

**Qué hace**: un `server {}` nuevo en `/srv/nexus-infra/proxy/conf.d/logbook.conf` con el patrón de variable + `resolver` de la casa (un contenedor caído solo tumba su subdominio) y las cabeceras de RD-06. **Sin barra final** en `proxy_pass`: con variable, una ruta reemplazaría la URI completa (`nginx_reverse_proxy.md`).

### 4.1 Escribir el archivo 🖥️

```bash
cat > /srv/nexus-infra/proxy/conf.d/logbook.conf <<'EOF'
# Logbook (kanban + bitácora) — https://github.com/HikkizZ/LogBook
server {
    listen 80;
    server_name logbook.zytech.dev;

    client_max_body_size 2m;

    location / {
        set $up_logbook logbook:3000;
        proxy_pass http://$up_logbook;

        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
EOF
cat /srv/nexus-infra/proxy/conf.d/logbook.conf
```

`resolver 127.0.0.11 valid=10s;` ya está en `00-default.conf`, no se repite. `X-Forwarded-For $proxy_add_x_forwarded_for` **añade** la IP de `cloudflared` al final de la lista que trae Cloudflare; la app, con `TRUST_PROXY` = subred de `web`, descarta esas dos y se queda con la IP real (revisión §3).

### 4.2 Validar, recargar y probar 🖥️

```bash
docker exec nginx-proxy nginx -t && docker exec nginx-proxy nginx -s reload
docker exec nginx-proxy wget -qS -O /dev/null --header="Host: logbook.zytech.dev" http://127.0.0.1/api/v1/health 2>&1 | grep -E 'HTTP/|Cache-Control'
docker exec nginx-proxy wget -qS -O /dev/null --header="Host: logbook.zytech.dev" http://127.0.0.1/p/siga 2>&1 | grep -E 'HTTP/|Content-Type'
docker exec nginx-proxy wget -qS -O /dev/null --header="Host: logbook.zytech.dev" http://127.0.0.1/api/v1/projects 2>&1 | grep -E 'HTTP/'
```

Debería ver `syntax is ok` + `test is successful` + `signal process started`; después `HTTP/1.1 200 OK` con `Cache-Control: no-store` en `/api/v1/health` (la ruta llegó **entera** a la app: si llegara como `/`, devolvería el HTML con `no-cache`), `200` + `text/html` en `/p/siga` (fallback del SPA) y `401` en `/api/v1/projects` (la API exige credencial: la ruta pasó entera). `127.0.0.1` y no `localhost` (resuelve a IPv6 y nginx escucha IPv4; tropiezo del portafolio).

### 4.3 Commit en `nexus-infra` 🖥️ (sesión `ssh nexus` desde el PC: el push usa mi llave reenviada)

```bash
cd /srv/nexus-infra
git status --short                              # solo proxy/conf.d/logbook.conf
git add proxy/conf.d/logbook.conf
git commit -m "feat(proxy): ruta logbook.zytech.dev -> logbook:3000"
git push
git log --oneline -1
```

Debería ver el push aceptado (`main -> main`). Si `Permission denied (publickey)`: no hay agente reenviado (`echo $SSH_AUTH_SOCK` vacío) → entrar con `ssh nexus` desde PowerShell, no desde Termius.

---

## 5. Ruta en el túnel de Cloudflare

**Qué hace**: publica `logbook.zytech.dev` por el túnel `Nexus` hacia `nginx-proxy:80`. Cloudflare crea solo el registro DNS tipo Túnel; **nunca** un registro `A`.

🌐 Zero Trust → **Redes → Conectores** (Tunnels) → `Nexus` → pestaña **Rutas de aplicaciones publicadas** (Published application routes; **no** "Rutas de nombre de host", que es para WARP) → **Añadir**: Subdominio `logbook`, Dominio `zytech.dev`, Ruta vacía, Tipo `HTTP`, URL `nginx-proxy:80`. Guardar.

Verificar 💻:

```powershell
Resolve-DnsName logbook.zytech.dev -Server aida.ns.cloudflare.com -DnsOnly
curl.exe -sI https://logbook.zytech.dev/api/v1/health
```

Debería ver un CNAME a `<id>.cfargotunnel.com` en el autoritativo (si mi PC dice "no existe" un rato, es caché negativa: `ipconfig /flushdns`); y en el `curl`, `HTTP/2 200` con `server: cloudflare`, `cache-control: no-store` y `content-security-policy`. En este punto **la app está abierta a internet sin Access** (solo la protege su propio login): seguir **de inmediato** con el paso 6, no dejarlo para otro día.

---

## 6. Cloudflare Access

**Qué hace** (RS-04, RD-07): una aplicación de Access para todo `logbook.zytech.dev` con dos políticas, una para mí (correo con código de un solo uso) y otra **Service Auth** para Claude Code con un service token de **1 año**. La app de Access con Bypass para `/api/v1/webhooks/github` **queda para v2** (tarea 10.5): hoy no hay webhook y una ruta sin Access sería una puerta sin uso.

### 6.1 Service token 🌐

Zero Trust → **Access → Service Auth → Service Tokens → Create Service Token**. Name `logbook-claude-code-pc`, **Service Token Duration: 1 year**. Generar.

Cloudflare muestra `CF-Access-Client-Id` y `CF-Access-Client-Secret` **una sola vez**. Copiarlos directo a Bitwarden (nota `logbook service token Access`, con la **fecha de vencimiento** que muestra la lista de tokens) y al `env` de la skill (paso 10). No pegarlos en ningún chat.

### 6.2 Aplicación 🌐

Zero Trust → **Access → Applications → Add an application → Self-hosted**:

- **Application name** `Logbook`; **Session Duration**: 24 h. La sesión de Access y la de la app son independientes: Access decide quién llega; la app, quién entra.
- **Application domain**: subdomain `logbook`, domain `zytech.dev`, path vacío.
- **Identity providers**: One-time PIN (el de por defecto; es el "código de un solo uso" de RS-04).
- **Policies** (dos, en este orden):
  1. `Solo yo` — Action **Allow**, Include → **Emails** → mi correo.
  2. `Claude Code (service token)` — Action **Service Auth**, Include → **Service Token** → `logbook-claude-code-pc`.
- **Settings → Cookie settings** (decisión D-1 de la revisión de la fase 1): **SameSite Attribute: Strict**, **HTTP Only: on**. "Enable Binding Cookie": apagado (exige WARP). "Application Launcher": da igual.

Guardar. Efecto visible de `SameSite=Strict` en la cookie de Access: al llegar desde un enlace externo (el vault, por ejemplo) la primera navegación no lleva la cookie y Access vuelve a hacer su redirección; si la sesión de Access sigue viva, pasa sola sin pedir código.

### 6.3 Verificar 💻

```powershell
curl.exe -sI https://logbook.zytech.dev/api/v1/health
```

Debería ver **`HTTP/2 302`** con `location: https://<equipo>.cloudflareaccess.com/...` (la página de login de Access), ya **no** el `200` del paso 5. Lo mismo con un `GET` normal: HTML de Cloudflare Access, no el de Logbook. Si sigue dando `200`, la aplicación no cubre el dominio (revisar subdominio/dominio) o Cloudflare aún no propagó (esperar un minuto).

---

## 7. Verificación final de 8.3

Es el "Listo cuando" de la tarea, punto por punto.

### 7.1 Login de Access y luego el de la app 💻 (navegador)

1. Abrir `https://logbook.zytech.dev` → página de Access → correo → código → entra.
2. Aparece el login de **Logbook** (no el tablero): contraseña del paso 2.1 → tablero.
3. DevTools → **Application → Cookies → `https://logbook.zytech.dev`**: dos cookies.
   - `__Host-lb_session`: `Secure` ✓, `HttpOnly` ✓, `SameSite` `Strict`, `Path` `/`, **sin** `Expires` (sesión de navegador). Es RS-10.
   - `CF_Authorization`: `Secure`, `HttpOnly`, `SameSite` `Strict` (si dice `Lax`/`None`, revisar 6.2).

### 7.2 Crear una tarjeta desde la UI 💻

Crear un proyecto y una tarjeta cualquiera (contenido genérico, RS-17). Si se crea, el chequeo CSRF pasó: el navegador mandó `Origin: https://logbook.zytech.dev` a través de Cloudflare y nginx, y coincide con `APP_ORIGIN`. Para verlo: DevTools → Network → el `POST /api/v1/cards` → Request Headers → `Origin` y `X-Logbook-CSRF: 1`; respuesta `201`. Un `403 FORBIDDEN` aquí significaría `APP_ORIGIN` mal escrito (barra final, `http`).

### 7.3 Token de API y `curl` con el service token 💻

En la UI: **Tokens → crear** `Claude Code PC` → copiar el `lb_...` una sola vez (vence a los 90 días; anotar la fecha, paso 10). Primero actualizo el `env` de la skill (paso 10, tercer ítem) y lo uso desde Git Bash, para que ningún secreto quede en el historial ni en la pantalla:

```bash
set -a; . /c/Users/fmira/.config/logbook/env; set +a
curl -s -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" -H "Authorization: Bearer $LOGBOOK_TOKEN" "$LOGBOOK_URL/me"; echo
curl -s -o /dev/null -w '%{http_code}\n' "$LOGBOOK_URL/me"
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $LOGBOOK_TOKEN" "$LOGBOOK_URL/me"
```

Debería ver, en orden: `{"auth":"token","name":"Claude Code PC","prefix":"lb_...","expiresAt":"..."}` (**200**: service token + Bearer); `302` (sin nada: página de Access, no la app); `302` (Bearer solo, sin headers de Access: tampoco pasa; el Bearer no sirve sin Access). Si el primero devuelve `302`, el service token no está en la política Service Auth; si devuelve `401` JSON, Access pasó y el Bearer está mal. (Equivale a `lb "$LOGBOOK_URL/me"` de la skill, que es la prueba 7.2 contra producción.)

Si Cloudflare bloqueara `curl` con un desafío (Bot Fight Mode), se ve como `403` HTML con `cf-mitigated: challenge`; se desactiva en Security → Bots o se crea una regla de WAF que salte el desafío para `logbook.zytech.dev` cuando lleguen los headers de Access. No debería pasar con el plan actual.

### 7.4 `db` sin puertos y rate limit con IP real 🖥️

```bash
docker inspect logbook-db --format '{{.NetworkSettings.Ports}} {{.HostConfig.PortBindings}}'
docker ps --format 'table {{.Names}}\t{{.Ports}}' | grep -E 'logbook'
docker logs logbook --tail 20 | grep -o '"auth":"[^"]*"' | sort | uniq -c
```

Debería ver `map[] map[]`; `logbook-db 5432/tcp` y `logbook 3000/tcp` (sin `0.0.0.0:`); y en los logs `"auth":"token:lb_..."` / `"auth":"session:..."`, nunca el secreto. Para confirmar que la IP que ve la app es la mía y no `172.18.0.3`: fallar el login **tres** veces seguidas con una contraseña mala y mirar la respuesta de la cuarta: todavía `401` (quedan dos intentos); si saliera `429` antes de 5 fallos míos, la subred de `TRUST_PROXY` está mal y los límites son globales (revisión §3). Después, un login correcto no cuenta (`skipSuccessfulRequests`).

Listo 8.3 cuando los cuatro bloques dan lo esperado.

---

## 8. 8.4 Respaldo diario y prueba de restore

**Qué hace** (RD-08): un `pg_dump` comprimido cada noche a `/srv/data/logbook/backups/`, 14 días de retención, y una prueba real de restore en el Postgres **de pruebas** (`postgres`, superusuario `hikki`), que es para esto. El backup de OVH (03:20 UTC, 1 día) copia `/srv/data` entero, incluida esta carpeta.

Dónde vive el script: en `nexus-infra` (`/srv/nexus-infra/scripts/`), que es donde va la infraestructura de Nexus con historial y copia fuera de OVH; el clon de `/srv/apps/logbook` no se toca para que `git pull` nunca choque con un archivo suelto. (Alternativa: `deploy/backup.sh` dentro del repo de Logbook en un commit posterior; decisión de §10.)

### 8.1 Script 🖥️

```bash
mkdir -p /srv/nexus-infra/scripts
cat > /srv/nexus-infra/scripts/logbook-backup.sh <<'EOF'
#!/bin/sh
# Respaldo diario de la base de Logbook (RD-08): pg_dump comprimido + retención de 14 días.
set -eu
DEST=/srv/data/logbook/backups
FILE="$DEST/logbook-$(date +%F).sql.gz"
umask 077
docker exec logbook-db pg_dump -U logbook -d logbook --no-owner --no-privileges | gzip > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
find "$DEST" -name 'logbook-*.sql.gz' -mtime +14 -delete
echo "$(date -Is) ok $(du -h "$FILE" | cut -f1) $FILE"
EOF
chmod 700 /srv/nexus-infra/scripts/logbook-backup.sh
/srv/nexus-infra/scripts/logbook-backup.sh
ls -la /srv/data/logbook/backups
gunzip -c /srv/data/logbook/backups/logbook-$(date +%F).sql.gz | head -20
```

Debería ver una línea `... ok 4.0K /srv/data/logbook/backups/logbook-AAAA-MM-DD.sql.gz`, el archivo con permisos `-rw-------`, y en el `head`, `-- PostgreSQL database dump` seguido de `CREATE TABLE public.card`... `--no-owner --no-privileges` hacen que el dump no dependa de que el rol `logbook` exista en el destino (en el Postgres de pruebas no existe). `set -eu` + `.tmp` + `mv`: si `pg_dump` falla, no queda un archivo a medias con nombre de respaldo bueno.

### 8.2 Cron 🖥️

Como `hikki` (está en el grupo `docker`; sin `sudo`):

```bash
( crontab -l 2>/dev/null; echo '30 4 * * * /srv/nexus-infra/scripts/logbook-backup.sh >> /srv/data/logbook/backups/backup.log 2>&1' ) | crontab -
crontab -l
date
```

`04:30` en la hora del servidor (`date` lo dice; si es UTC son las 01:30 en Chile, después del backup de OVH de las 03:20 UTC... que entonces copia el dump del día anterior; es aceptable). Al día siguiente: `tail -3 /srv/data/logbook/backups/backup.log` debe tener una línea `ok`.

Commit del script en `nexus-infra` (sesión `ssh nexus`): `cd /srv/nexus-infra && git add scripts/logbook-backup.sh && git commit -m "feat(scripts): respaldo diario de la base de logbook" && git push`.

### 8.3 Prueba de restore en el Postgres de pruebas 🖥️

```bash
ORIG=$(docker exec logbook-db psql -U logbook -d logbook -tAc 'select count(*) from card'); echo "card en producción: $ORIG"
docker exec postgres psql -U hikki -c 'CREATE DATABASE logbook_restore;'
gunzip -c /srv/data/logbook/backups/logbook-$(date +%F).sql.gz | docker exec -i postgres psql -U hikki -d logbook_restore -q -v ON_ERROR_STOP=1
REST=$(docker exec postgres psql -U hikki -d logbook_restore -tAc 'select count(*) from card'); echo "card restauradas: $REST"
[ "$ORIG" = "$REST" ] && echo "RESTORE OK" || echo "RESTORE DISTINTO"
docker exec postgres psql -U hikki -c 'DROP DATABASE logbook_restore;'
```

Debería ver los dos `count(*)` iguales (con la tarjeta del paso 7.2 al menos `1`) y `RESTORE OK`; sin errores de `ON_ERROR_STOP` (si saltara `role "logbook" does not exist`, faltó `--no-owner`/`--no-privileges` en el dump). La base de prueba se borra al final: el Postgres de pruebas no guarda datos de Logbook. **Un respaldo que nunca restauré es una esperanza, no un respaldo** (`respaldos.md`).

Bajar una copia al PC cada tanto 💻: `scp nexus:/srv/data/logbook/backups/logbook-AAAA-MM-DD.sql.gz C:\Users\fmira\Backups\` (fuera del repo y del vault; es el "1 offsite" de la regla 3-2-1 para los datos).

---

## 9. Actualizar y qué hacer si algo falla

### 9.1 Actualizar (RD-09) 🖥️

```bash
cd /srv/apps/logbook && git pull && docker compose up -d --build
docker compose logs logbook --tail 20
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep logbook
```

`git pull` usa la deploy key; `--build` reconstruye solo si cambió algo (capas cacheadas). En los logs, `Migraciones ejecutadas: ...` (o `ninguna`) y `API escuchando`; `logbook` vuelve a `healthy` en ~30 s. Corte de servicio: los segundos del recreate (nginx responde 502 mientras tanto, gracias al patrón con variable no se cae nada más). Una vez al mes, `docker compose build --pull && docker compose up -d` para traer los parches de `node:22-alpine`/`postgres:18-alpine` (I-3 de la revisión), y `docker image prune -f` para borrar las imágenes viejas.

### 9.2 Si algo falla

| Síntoma | Qué mirar | Qué hacer |
|---|---|---|
| `502` en el navegador | `docker ps` → ¿`logbook` está `Up`? `docker compose logs logbook --tail 50` | Si está en `Restarting`, es el `.env` o la base (mensajes `fatal` al inicio del log). Si está `Up` y nginx da 502: `docker exec nginx-proxy wget -qO- http://logbook:3000/api/v1/health` |
| Página de Access en vez de la app aunque ya me autentiqué | `curl.exe -sI` con y sin headers (7.3) | Sesión de Access vencida (volver a pedir código); con `curl`, el service token vencido (fecha en Bitwarden) |
| `403` al guardar algo desde la UI | DevTools → `Origin` del `POST` | `APP_ORIGIN` del `.env` ≠ `https://logbook.zytech.dev` exacto |
| `429` enseguida en el login | logs: `"auth":...` y la IP | `TRUST_PROXY` no coincide con la subred de `web` (paso 2.1) |
| `logbook` `unhealthy` pero `Up` | `docker compose logs logbook`, `docker compose logs db` | Docker no reinicia por `unhealthy` (I-4): `docker compose restart logbook` |
| Migración falló en un `git pull` | el `fatal` de `migrate.js` en el log; la app **no** arranca (el `&&`) | Rollback de código (abajo); si la migración quedó a medias, restaurar respaldo |

**Rollback a un commit anterior** 🖥️ (la base no se toca; las migraciones no se deshacen solas):

```bash
cd /srv/apps/logbook && git log --oneline -5
git checkout <commit-bueno> && docker compose up -d --build
# después, para volver a seguir main:
git checkout main
```

Si el commit malo trajo una migración nueva que **sí** corrió (la app está `Up`), antes del `checkout`: `docker exec logbook node dist/migrate.js revert` (deshace **la última**; `docker compose logs` dirá cuál). Si la migración falló, no hay nada que deshacer: TypeORM la ejecuta en una transacción y no quedó aplicada.

**Restaurar un respaldo en producción** 🖥️ (último recurso; borra lo posterior al dump):

```bash
cd /srv/apps/logbook && docker compose stop logbook
docker exec logbook-db psql -U logbook -d postgres -c 'DROP DATABASE logbook;' -c 'CREATE DATABASE logbook OWNER logbook;'
gunzip -c /srv/data/logbook/backups/logbook-AAAA-MM-DD.sql.gz | docker exec -i logbook-db psql -U logbook -d logbook -q -v ON_ERROR_STOP=1
docker compose start logbook && docker compose logs logbook --tail 10
```

`migrate.js` al arrancar verá la tabla `migrations` del dump y dirá `ninguna`. Si la base está rota de verdad (no arranca), la otra vía es el backup de OVH (restaura el **VPS entero**, `respaldos.md`).

---

## 10. Lo que tengo que anotar después (8.5)

> **Para `pendientes.md`, `arquitectura.md` y `setup_guia.md` del vault (RD-10), y para la skill:**
>
> - [ ] **Service token de Access** `logbook-claude-code-pc`: creado el `AAAA-MM-DD`, **vence el `AAAA-MM-DD` (+1 año)** → recordatorio en `pendientes.md` un mes antes: regenerar en Zero Trust → Service Auth y actualizar el `env` de la skill (RS-18).
> - [ ] **Token de API** `Claude Code PC`: creado el `AAAA-MM-DD`, **vence el `AAAA-MM-DD` (+90 días)** → recordatorio en `pendientes.md`: crear uno nuevo en la UI (Tokens) antes de esa fecha y cambiar `LOGBOOK_TOKEN`.
> - [ ] **`env` de la skill** (`C:\Users\fmira\.config\logbook\env`, nunca en el repo ni en el vault): `LOGBOOK_URL=https://logbook.zytech.dev/api/v1`, `LOGBOOK_TOKEN=<el nuevo>`, `CF_ACCESS_CLIENT_ID=<id>`, `CF_ACCESS_CLIENT_SECRET=<secret>`. Después, repetir la prueba 7.2 de la fase 7 contra producción (`lb "$LOGBOOK_URL/me"` → `[http 200]`).
> - [ ] `arquitectura.md` → tabla de apps: `Logbook · logbook.zytech.dev · /srv/apps/logbook (repo privado HikkizZ/LogBook, deploy key github-logbook) · logbook + logbook-db · redes web + logbook_logbook_internal, sin puertos, datos en /srv/data/logbook/postgres, respaldo diario en /srv/data/logbook/backups (cron 04:30, 14 días), Access con correo + service token`. Contenedores: ahora son 6.
> - [ ] `setup_guia.md` → sección nueva "18. Logbook" con la fecha, los commits de `nexus-infra` (`logbook.conf`, `scripts/logbook-backup.sh`) y los tropiezos reales que aparezcan.
> - [ ] `pendientes.md`: marcar hecho el ítem "Al desplegar la primera app con base de datos: `pg_dump` programado"; añadir "bajar una copia del respaldo al PC cada ~2 semanas"; añadir "`docker compose build --pull` mensual en logbook"; anotar la decisión sobre B-3 (rol superusuario) de la revisión #3.
> - [ ] Bitwarden: notas `logbook .env (Nexus)`, `logbook contraseña UI`, `logbook service token Access` (con vencimiento), `logbook token API` (con vencimiento).
> - [ ] `03_plan_implementacion.md`: corregir la frase del `$$` en el "Listo cuando" de 8.3 (I-6) y marcar 8.3/8.4.
