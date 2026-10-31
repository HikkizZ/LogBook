# Revisión de Fable #3 — Fase 8, imagen y compose de producción (antes de 8.3)

Fecha: 2026-10-27. Commits revisados: `943eed0` (8.1, Dockerfile + `mountWeb`) y `71d4f36` (8.2, compose + `.env.example`), rama `fase-8-despliegue`. Archivos: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `.env.example`, `apps/api/src/http/web.ts`, `apps/api/src/app.ts`, `apps/api/src/http/rate-limit.ts`, `apps/api/src/server.ts`, `apps/api/src/migrate.ts`, `.github/workflows/ci.yml` y la sección Despliegue del `README.md`, contra RS-05, RS-08, RS-11, RS-14..RS-16 y RD-01..RD-09 de [[../spec/01_especificacion]], la fase 8 de [[../spec/03_plan_implementacion]] y las notas de Nexus del vault (`06_nexus_server/`). Es la checklist que el plan llama "Revisión de Fable #3": Dockerfile (usuario, secretos no horneados), compose (sin `ports` en `db`, redes), `.env.example`, `trust proxy` acotado y `pnpm audit`.

Lo que ejecuté en el PC:

- `docker build -t logbook:review .` → termina (BuildKit, caché de pnpm). **67,99 MB** (`docker image inspect`), muy por debajo de los 250 MB de 8.1.
- `docker image inspect` → `User=node`, `Env` con `NODE_ENV=production PORT=3000 WEB_DIST_DIR=/app/web` y nada más que lo de la imagen base; `Cmd=sh -c node dist/migrate.js && node dist/server.js`.
- `docker history --no-trunc` → ninguna capa con `.env`, `COPY .env`, `ARG`/`ENV` de secretos; las únicas `ENV` son las tres de arriba y las de `node:22-alpine`.
- Dentro de la imagen (`docker run --rm logbook:review sh -c ...`): `id` → `uid=1000(node)`; `/app` solo tiene `dist/`, `node_modules/` (12 paquetes de producción), `package.json` y `web/`; `find /app -name ".env*"` → nada; `find dist -name "*.test.js"` → 0; `which pnpm` → no existe; `which wget` → `/usr/bin/wget` (busybox: el healthcheck funciona).
- `docker compose config` en una carpeta de prueba con un `.env` de mentira: el hash entre comillas simples llega al contenedor literal (`config` lo muestra como `$$argon2id$$v=19...`, que es como Compose imprime un `$` escapado); sin comillas, Compose intentaría interpolar `$argon2id` y la app se negaría a arrancar (`assertPasswordHash`), que es el fallo seguro.
- `pnpm audit --audit-level=low` → **No known vulnerabilities found** (RS-14).
- `printf 'x' | docker run --rm -i logbook:review node dist/scripts/hash-password.js` → imprime un hash PHC `$argon2id$v=19$m=65536,p=4,t=3$...`: el script del hash **viaja en la imagen** y se puede usar en Nexus.

## Veredicto: **Aprobado con cambios menores — se puede pasar a 8.3**

No hay nada bloqueante ni de severidad alta. La imagen cumple RS-14/RS-16 y RD-03/RD-04 (usuario `node`, sin secretos en capas, sin fuentes ni pnpm, `NODE_ENV=production`, migraciones al arrancar), el servido de estáticos no tapa la API ni permite salir de `apps/web/dist`, y el compose cumple RD-02 al pie de la letra (sin `ports`, `db` solo en la red interna, healthchecks, `restart`, `depends_on` con `service_healthy`). El `trust proxy` queda acotado a la subred de `web` y **el rate limit ve la IP real del visitante**, no la de `cloudflared` (análisis en §3).

Hay dos cambios de una línea que recomiendo hacer antes de desplegar (B-1 `internal: true` en la red interna, B-2 `exec` en el `CMD`) y una desviación de RS-15 que Felipe tiene que decidir conscientemente (B-3: el rol `logbook` de Postgres es superusuario). Ninguno exige rehacer nada ni cambia la guía de despliegue; si se aplican, van en un commit de la misma rama antes de 8.3.

---

## 1. Lo que está bien (verificado)

| Qué | Dónde | Cómo lo comprobé |
|---|---|---|
| Usuario no root | `Dockerfile:36` `USER node` | `id` dentro del contenedor → uid 1000 |
| Sin secretos horneados ni en capas intermedias | `Dockerfile` completo; `.dockerignore:16-18` (`.env`, `.env.*`, `!.env.example`) | `docker history` sin `.env`; `find /app -name ".env*"` vacío. La etapa `build` hace `COPY . .` pero el `.env` nunca entra al contexto, así que tampoco queda en la capa intermedia |
| Superficie mínima | `Dockerfile:22-23,32-33` (`pnpm deploy --prod`, se borran `src/`, `tsconfig*`, `vitest.config.ts`) | 12 paquetes en `node_modules`, 0 tests en `dist`, sin pnpm, 68 MB |
| `NODE_ENV=production` fijado en la imagen | `Dockerfile:27` | no depende del `.env` (RS-16) |
| `.dockerignore` | excluye `.git`, `.github`, `docs`, `*.md`, `node_modules`, `dist`, `coverage`, compose y el propio Dockerfile | el contexto solo lleva lo que se compila |
| Migraciones al arrancar, nunca `synchronize` | `Dockerfile:38`, `migrate.ts:9-24`, `data-source.ts:15` | `migrate.js` sale con código 1 si falla y el `&&` impide que arranque el servidor (RD-04) |
| Path traversal en estáticos | `web.ts:20` `express.static(root)` con `root` absoluto; `web.ts:42` `sendFile(indexFile)` con ruta fija | `serve-static`/`send` normalizan y rechazan `..` y bytes nulos; el fallback no toma nada de la URL |
| El fallback no tapa la API | `web.ts:37` `/^\/api(\/|$)/`; `app.ts:126-130` el router de `/api/v1` cierra con `NOT_FOUND` **después** de `requireAuth` | tests `web.test.ts:61,68`: `/api/v1/loquesea` sin credencial → 401 JSON, con credencial → 404 JSON. Nunca HTML |
| `/assets` inexistente → 404 de texto, no `index.html` | `web.ts:31-33` | test `web.test.ts:55` (evita servir HTML como si fuera un script viejo y cacheado) |
| Cabeceras en el HTML | `app.ts:75-97` (helmet va antes de `mountWeb`) | test `web.test.ts:80`: CSP de RS-08, `nosniff`, `Referrer-Policy`, `Permissions-Policy` también en `index.html` y en el fallback |
| Caché | `web.ts:24-25,41` | `/assets/*` `immutable` un año (nombres con hash), `index.html` y fallback `no-cache`, `/api/v1` `no-store` (B-2 de la fase 2) |
| Sin `ports` en `db` ni en `logbook` | `docker-compose.yml` | `docker compose config` no genera `ports`; solo `EXPOSE 3000` informativo en la imagen |
| Redes | `docker-compose.yml:9-11,32-33,40-43` | `logbook` en `web` (externa) + `logbook_internal`; `db` solo en `logbook_internal` |
| Healthchecks y `restart` | `:15-20` (`wget` a `/api/v1/health`, que responde 503 si la base no contesta, `app.ts:113-116`), `:34-38` (`pg_isready`), `restart: unless-stopped` en los dos | `wget` de busybox devuelve error con un 503 |
| Volumen de Postgres 18 | `:31` `/srv/data/logbook/postgres:/var/lib/postgresql` | la ruta correcta para la imagen 18 (el vault lo documenta en `postgres_en_docker.md`); el entrypoint corre como root al inicio y deja `18/docker` con uid 70 y `700`, igual que el Postgres de pruebas |
| `.env.example` completo y sin valores reales | `.env.example` | las 10 variables de RD-05 (`DATABASE_URL`, `POSTGRES_PASSWORD`, `ADMIN_PASSWORD_HASH`, `APP_ORIGIN`, `APP_TIMEZONE`, `PORT`, `TRUST_PROXY`, `NODE_ENV`, `WEB_DIST_DIR`, `GITHUB_WEBHOOK_SECRET`) con comentarios; `server.ts:13-26` exige las tres críticas y valida el hash y la zona horaria antes de escuchar |
| Hash con `$` | `.env.example:12-15` | comillas simples: verificado con `docker compose config` (arriba) |
| `TRUST_PROXY` acotado | `app.ts:26-31,51-56` | lista de subredes/IPs, nunca `true`; en producción con la variable vacía solo avisa (ver §3) |
| Logs | `app.ts:58-72`, `logger.ts:6-12` | el serializador de `req` solo escribe `id`, `method` y `url` sin query; aunque se activaran los headers, `cookie`, `authorization` y `cf-access-client-secret` van redactados |
| CI | `ci.yml:55-57` | `pnpm audit --audit-level=high` y `docker build` en cada PR |

---

## 2. Hallazgos

### Bajos

**B-1 — La red `logbook_internal` no es `internal: true`: el contenedor de Postgres tiene salida a internet.**
`docker-compose.yml:43`. Compose crea `logbook_internal` como red bridge normal, con NAT hacia afuera. `db` no necesita hablar con nadie más que `logbook`. Escenario: si alguien consigue ejecutar código dentro del contenedor de Postgres (ver B-3), hoy puede abrir conexiones salientes y llevarse el dump. Con `internal: true` Docker no le da ruta por defecto y la exfiltración directa desde `db` deja de ser posible; `logbook` sigue saliendo por `web` (y lo necesita solo para nada hoy: no llama a servicios externos). Ajuste:

```yaml
networks:
  web:
    external: true
  logbook_internal:
    internal: true
```

Comprobación en Nexus: `docker exec logbook-db wget -q -T 3 -O /dev/null http://1.1.1.1 ; echo $?` → distinto de 0 (sin ruta); `docker exec logbook wget -qO- http://127.0.0.1:3000/api/v1/health` → `{"ok":true,"db":true}` (la app sigue llegando a `db` por nombre: el DNS interno de Docker funciona igual en redes `internal`).

**B-2 — `CMD ["sh","-c","node dist/migrate.js && node dist/server.js"]`: node no es PID 1 y la señal de parada le llega por `sh`.**
`Dockerfile:38`. Con `sh -c "a && b"`, `b` corre como hijo de `sh`; `docker stop` manda `SIGTERM` a `sh`, que como PID 1 no la reenvía, y Docker mata todo a los 10 s. No pude reproducir el retardo en Docker Desktop (los dos `docker stop` de prueba tardaron menos de 3 s y terminaron con código 137 en ambos casos, así que mi prueba no discrimina), pero el patrón es el documentado en Docker y la corrección cuesta una palabra:

```dockerfile
CMD ["sh", "-c", "node dist/migrate.js && exec node dist/server.js"]
```

Con `exec`, el servidor reemplaza a `sh` y recibe `SIGTERM` directo (node sale limpio con 143). Alternativa sin tocar la imagen: `init: true` en el servicio `logbook` del compose (Docker mete `tini` como PID 1 y reenvía señales). Comprobación en Nexus: `time docker stop logbook` → bien por debajo de 10 s y `docker inspect logbook --format '{{.State.ExitCode}}'` → `143`, no `137`. Impacto hoy: `docker compose up -d --build` en cada actualización tarda 10 s más y corta conexiones a medias; no hay pérdida de datos (Postgres es transaccional).

**B-3 — El rol `logbook` de Postgres es superusuario (desviación de RS-15).**
`docker-compose.yml:27-29`. La imagen oficial crea `POSTGRES_USER` como **superuser**; RS-15 pide "usuario de la app con permisos solo sobre su base (no superusuario)". Escenario: una inyección SQL que hoy no existe (TypeORM parametriza, Zod valida) le daría a un atacante `COPY ... TO PROGRAM` o `pg_read_file` dentro del contenedor `db`, en vez de solo mi tablero. Lo que lo mitiga: el contenedor de Postgres es de un solo inquilino, sin `ports`, sin otras bases, y con B-1 sin salida a internet; el daño queda contenido en un contenedor cuyo único contenido es la base que ya podría leer.

Para cumplir RS-15 literalmente haría falta un script en `docker-entrypoint-initdb.d/` que cree un rol `logbook_app` sin `SUPERUSER`, dueño de la base, y cambiar `DATABASE_URL` para usarlo (las migraciones crean tablas, así que el rol tiene que ser dueño del esquema). No es difícil, pero es código nuevo en el compose y un volumen más; **no lo haría antes de 8.3**. Propongo aceptar la desviación por escrito (anotarla en RS-15 como "el rol es superusuario del contenedor, que solo contiene su base; compensado con red interna sin salida y sin `ports`") y dejarlo como mejora para v2. Decisión de Felipe (§5).

### Informativos (sin acción obligatoria)

- **I-1** `Dockerfile:32-33`: los archivos de `/app` son de `node:node` con permiso de escritura, así que el proceso puede modificar su propio código (`dist/`). `COPY --from=build --chown=root:root` (legible por todos, escribible solo por root) cierra la persistencia dentro del contenedor sin afectar a nada: la app no escribe en disco. Costo cero; se puede hacer junto con B-2.
- **I-2** La imagen final arrastra `npm`, `npx`, `yarn`, `corepack` de `node:22-alpine` (`ls /usr/local/bin`). No son un riesgo por sí mismos (no hay acceso de red entrante al contenedor), pero sobran; un `RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/{npm,npx,yarn,yarnpkg,corepack}` en la etapa final ahorra ~10 MB. Opcional.
- **I-3** `node:22-alpine` y `postgres:18-alpine` por tag, no por digest (es lo que pide RS-14). Consecuencia operativa: `docker compose up -d --build` **no** vuelve a bajar la base, así que los parches de Alpine/Node solo entran con `docker compose build --pull`. Lo anoté en la guía como tarea mensual.
- **I-4** Docker **no reinicia** un contenedor `unhealthy` (eso lo hace Swarm). Si la app pierde la base de forma permanente (`/health` → 503), queda `unhealthy` hasta que yo haga `docker compose restart logbook`; nginx seguiría mandándole tráfico. Con `depends_on: service_healthy` y `restart: unless-stopped` el arranque está cubierto; el caso raro queda para los logs. Vale la pena saberlo al leer `docker ps`.
- **I-5** `.env.example` no lista `LOG_LEVEL` (opcional, `logger.ts:65-67`, por defecto `info`). No hace falta; lo menciono por completitud.
- **I-6** El "Listo cuando" de 8.3 en el plan dice "el hash de `ADMIN_PASSWORD_HASH` va con los `$` escapados como `$$` en el compose"; lo implementado (mejor) es el hash en el `.env` entre comillas simples y sin tocar el compose. Verificado con `docker compose config`. Conviene corregir esa frase del plan al cerrar 8.3.
- **I-7** Un `POST` a una ruta que no es de la API (`/loquesea`) pasa de largo del fallback (`web.ts:37`) y termina en el 404 por defecto de Express (`Cannot POST /loquesea`, HTML mínimo, sin stack). Correcto para RS-16; solo es distinto del JSON de la API, que es lo que pide el test `web.test.ts:75`.
- **I-8** `app.ts:52-56`: si `TRUST_PROXY` llega vacío en producción solo hay un `warn`; la app arranca con todos los límites por IP colapsados en una sola IP (la de nginx). Preferiría que fuera fatal como `APP_ORIGIN`, pero la guía lo deja rellenado y verificado, así que no lo subo de informativo.

---

## 3. `TRUST_PROXY` y la IP real: qué ve el rate limit

Cadena en producción: navegador → Cloudflare → túnel → `cloudflared` (en `web`, hoy `172.18.0.3`) → `nginx-proxy` (en `web`) → `logbook:3000` (en `web` + `logbook_internal`).

Cabeceras que llegan a Express:

1. **Cloudflare** pone `CF-Connecting-IP: <IP real>` y **añade** la IP real al final de `X-Forwarded-For`. Importante: si el cliente ya traía un `X-Forwarded-For` falso, Cloudflare **no lo quita**, lo conserva y le agrega la real al final: `X-Forwarded-For: <falso>, <IP real>`.
2. `cloudflared` reenvía las cabeceras tal cual.
3. `nginx` con `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` (RD-06) agrega la IP de quien le habló, `cloudflared`: `X-Forwarded-For: <falso>, <IP real>, 172.18.0.3`.
4. Express ve la conexión desde `nginx-proxy` (`172.18.0.x`).

Con `app.set('trust proxy', ['172.18.0.0/16'])` (`app.ts:51`), `req.ip` se calcula **de derecha a izquierda** saltando todo lo que esté en la lista de confianza: la IP del socket (nginx, confiable) → `172.18.0.3` (cloudflared, confiable) → `<IP real>` (no confiable, **se detiene aquí**). `req.ip = <IP real>`. El `<falso>` nunca se mira, porque la búsqueda para en la primera IP no confiable. Esto es exactamente lo que RS-05 pide y es lo que hace que `trust proxy: true` sea peligroso (con `true` se tomaría el primer valor de la lista, el falso) y la subred correcto.

Consecuencias prácticas:

- Los dos limitadores (`rate-limit.ts:17,33`) usan `ipKeyGenerator(req.ip)`: **login 5/15 min por IP real del visitante**, no una cuota global compartida por todo el que pase por `cloudflared`. Con Cloudflare Access delante, quien llega al login ya es yo o alguien con mi correo; el límite sigue sirviendo contra un script con mi sesión de Access.
- **Si la subred de `web` no es la que está en `TRUST_PROXY`**, la cadena se rompe en el primer salto: `req.ip` pasa a ser la IP de nginx y todos los límites por IP son globales (5 logins fallidos cada 15 min **para todos**, incluido yo). Por eso la guía obtiene la subred con `docker network inspect web` y lo verifica en los logs de acceso de la app (`auth` + `req`), no lo da por sentado. Si algún día se recrea la red `web` con otra subred, hay que actualizar el `.env`.
- `express-rate-limit` 8 valida la configuración en la primera petición: con `trust proxy` como lista no dispara `ERR_ERL_PERMISSIVE_TRUST_PROXY` (solo lo hace con `true`). No hará falta desactivar validaciones.
- `CF-Connecting-IP` sería una alternativa más corta (una sola cabecera que Cloudflare siempre sobrescribe), pero exigiría confiar en que **solo** Cloudflare puede poner esa cabecera, y adentro de `web` cualquier contenedor podría; el esquema actual con subred es más robusto y no necesita el módulo `real_ip` de nginx. No cambiar.

---

## 4. Lo que miré y descarté

- **`Origin` detrás de dos proxies**: ni Cloudflare ni nginx tocan `Origin`; `proxy_set_header Host $host` solo afecta a `Host`. La comparación `origin !== appOrigin` (`middleware.ts:91`) seguirá viendo `https://logbook.zytech.dev`. Lo confirma la prueba de crear una tarjeta del "Listo cuando" de 8.3.
- **Cookie `__Host-`** exige `Secure` y `Path=/`; el navegador la acepta porque habla HTTPS con Cloudflare, aunque el último tramo sea HTTP. La app no mira `X-Forwarded-Proto` para decidir nada (la cookie siempre lleva `Secure`), así que no hay dependencia de esa cabecera.
- **Cloudflare y la caché**: `/assets/*` con `immutable` puede quedar en el borde de Cloudflare (extensiones estáticas), que es lo deseado; `index.html` lleva `no-cache` y las respuestas de `/api/v1` `no-store`, que Cloudflare respeta. La cookie de Access y la de sesión nunca se cachean.
- **`.env` en el contenedor**: `env.ts:53-58` busca `../../../.env` relativo a `dist/`, que en la imagen es `/.env`: no existe, `quiet: true`, sin efecto. Las variables llegan por `env_file` del compose. El `.env` del host **sí** entra completo al entorno del contenedor `logbook` (incluido `POSTGRES_PASSWORD`, que ya viaja en `DATABASE_URL`): redundante, no un riesgo nuevo.
- **`client_max_body_size 2m` (RD-06) vs `json({ limit: '256kb' })` (`app.ts:99`)**: nginx deja pasar hasta 2 MB y la app rechaza con 413 a partir de 256 kB. Coherente (el webhook de v2 pedirá 1 MB).
- **Migraciones concurrentes**: una sola réplica, sin problema. Si algún día hay dos, `migrate.js` tendría que correr aparte.
- **`EXPOSE 3000`** no publica nada; solo documenta. `docker ps` mostrará `3000/tcp` sin `0.0.0.0`.

---

## 5. Decisiones para Felipe

1. **B-1** `internal: true` en `logbook_internal`: recomiendo aplicarlo ahora (una línea, sin efectos secundarios). Sí / no.
2. **B-2** `exec` en el `CMD` (y opcionalmente I-1 `--chown=root:root`): recomiendo aplicarlo ahora en el mismo commit. Sí / no.
3. **B-3** rol superusuario: aceptar la desviación de RS-15 por escrito y dejar el rol sin privilegios para v2, o hacerlo antes de 8.3 (script de init + `DATABASE_URL` con otro rol; añadiría una tarea a la fase 8). Mi recomendación: aceptar y anotar.
4. **I-6** corregir la frase del `$$` en el plan al cerrar 8.3.

## 6. Estado

- 2026-10-27: revisión escrita. Pendiente: decisiones de §5 y, si se aplican B-1/B-2, un commit `build:` en `fase-8-despliegue` antes de empezar la guía [[../deploy/nexus]].

## Decisiones de Felipe (2026-10-31)

- **B-3**: acepto en v1 que el rol `logbook` de Postgres sea superusuario. El riesgo es bajo porque la base no publica puertos y su red es interna (B-1). En v2, rol sin privilegios con un script de init.
- **Respaldo**: el script vive en `nexus-infra/scripts/logbook-backup.sh`, junto al resto de la infraestructura del servidor.
- **Cloudflare Access**: sesión de 24 h y One-time PIN a mi correo como único método de login.
- **Merge antes del clon**: `fase-8-despliegue` se mergea a `main` antes de seguir la guía, porque el servidor clona `main`.
