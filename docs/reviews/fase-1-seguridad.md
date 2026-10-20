# Revisión de seguridad — fase 1 (base de datos y autenticación)

Revisor: Fable. Fecha: 2026-10-20. Rama `fase-1-auth` (commits `30b0ba7..1cb2105` sobre `main`). Alcance: `apps/api/src/`, `packages/shared`, `.env.example`, `.env.test`, contra [[../spec/01_especificacion]] §4.1, §4.2, §4.9, §4.12 y §5 (RS-01..RS-18) y las decisiones P7 y P12 de [[../spec/00_logbook]].

Qué corrí: `pnpm test` (82 tests en 9 archivos, todos en verde, 34 s), `pnpm audit --audit-level=high` (sin vulnerabilidades), `pnpm --filter api hash-password` (produce `$argon2id$v=19$m=65536,p=4,t=3$…`), y una sonda ad hoc con Supertest contra `db-test` para comprobar los escenarios que los tests no cubren (bloqueo del login por rate limit, 404, charset, `Authorization` vacío, `Cache-Control`, variantes de `Origin`, fuga en logs). Los resultados de la sonda están citados en cada hallazgo.

## Veredicto

**La fase 1 cumple §5 en lo esencial y no tiene hallazgos críticos ni altos.** Precedencia Bearer/cookie, CSRF, flags y rotación de la cookie, vencimientos 12 h / 7 d / 90 d con comparaciones de borde correctas, hash SHA-256 + `timingSafeEqual`, argon2id, redacción de logs, errores sin stack, límite de 256 KB y validación con Zod están implementados como dice la spec y cubiertos por tests que citan el RS.

Hay **tres hallazgos medios** que recomiendo corregir antes de abrir la fase 2: dos son la misma debilidad (el rate limit puede dejar a Felipe sin login durante 15 min desde su propio navegador, sin conocer la contraseña) y el tercero es de diseño (no hay "denegar por defecto": cada ruta nueva de la fase 2 tiene que acordarse de `requireAuth`). El resto son bajas e informativas.

Cobertura de §5 en esta fase: RS-01 ✓, RS-02 ✓, RS-03 ✓, RS-05 ✓ con M-1/M-2, RS-07 ✓ con B-3, RS-08 ✓, RS-09 ✓, RS-10 ✓, RS-11 ✓, RS-13 ✓, RS-14 ✓ (audit limpio; Dockerfile es fase 8), RS-16 ✓ con B-1. RS-04, RS-06, RS-12, RS-15, RS-17, RS-18 no aplican todavía (Access, webhook, frontend, despliegue).

## Hallazgos

Cada hallazgo trae el test que **hoy debería fallar** y pasar tras la corrección. No toqué código: las correcciones las hace otro agente con el test primero.

### Medios

#### M-1 — Los fallos de CSRF y de validación en `/auth/login` consumen el límite de 5 intentos

- **Dónde**: `apps/api/src/routes/auth.ts:28-32` (orden `loginRateLimit` → `requireCsrf` → `validate`), `apps/api/src/http/rate-limit.ts:26-37` (`skipSuccessfulRequests: true` cuenta todo lo que responda ≥ 400).
- **Requisito**: RS-05 ("5 intentos fallidos / 15 min por IP"; la intención es contar contraseñas incorrectas, no peticiones rechazadas antes de mirar la contraseña).
- **Escenario**: Felipe tiene abierta una pestaña con una página ajena. Esa página lanza cinco `fetch('https://logbook.zytech.dev/api/v1/auth/login', { method: 'POST', mode: 'no-cors', body: '…' })`. No llevan `X-Logbook-CSRF` ni `Origin` válido, así que la app responde 403 a cada una, pero **las cinco salen con la IP de Felipe** y el limitador las cuenta. Durante 15 min la contraseña correcta responde 429. Repetible mientras la pestaña siga abierta. Para que las peticiones lleguen a la app tienen que pasar Cloudflare Access: eso depende del atributo `SameSite` de la cookie `CF_Authorization` (ver decisión D-1). Aunque Access lo frene, la app no debería depender de eso para no bloquear a su único usuario.
- **Sonda**: 5 × `POST /auth/login` sin cabeceras CSRF → 403, 403, 403, 403, 403; luego login con CSRF y contraseña correcta → **429**.
- **Test que debería fallar hoy**: `RS-05 cinco rechazos por CSRF o validación no consumen el límite del login`: cinco `POST /auth/login` sin `X-Logbook-CSRF` (esperar 403) y cinco con body `{}` (esperar 400); después un login correcto con CSRF → esperar **204** (hoy 429). Y el inverso ya existente (cinco 401 por contraseña → 429) tiene que seguir pasando.
- **Corrección sugerida**: que el limitador cuente solo contraseñas incorrectas: montar `loginRateLimit()` **después** de `requireCsrf` y `validate` (así un 403/400 nunca llega al limitador), o en su defecto `skip`/`requestWasSuccessful` por estado `!== 401`.

#### M-2 — `/auth/login` y `/health` comparten el límite general por IP: 600 peticiones anónimas bloquean el login

- **Dónde**: `apps/api/src/app.ts:95` (`v1.use(authenticate, apiRateLimit(), csrfGuard)` se aplica a todo, incluidos `/health` y `/auth/login`, que sin credencial caen a la clave `ip:`).
- **Requisito**: RS-05 (el límite general es "por credencial; por IP si no hay credencial", pensado para proteger la API, no para poder bloquear el login).
- **Escenario**: mismo vector que M-1 pero sin necesidad de que la petición "parezca" un login: 600 `fetch('/api/v1/health', { mode: 'no-cors' })` desde una página ajena en el navegador de Felipe (o cualquier cliente que comparta su IP pública, ver B-4) agotan la cuota de su IP; a partir de ahí `POST /auth/login` responde 429 aunque el limitador propio del login esté intacto. También puede autoinfligirse: una UI que haga polling estando deslogueada.
- **Sonda**: 600 × `GET /api/v1/health` sin credencial → 200; luego login correcto → **429**.
- **Test que debería fallar hoy**: `RS-05 el límite general por IP no bloquea el login`: 600 `GET /api/v1/health` anónimos y luego un login correcto → esperar **204** (hoy 429). Complemento: `GET /health` nunca responde 429 (el healthcheck de Docker lo golpea cada 30 s y no debe tumbar el contenedor).
- **Corrección sugerida**: montar `/health` antes del limitador general, y que el limitador general salte `/auth/login` (que ya tiene el suyo), por ejemplo con `skip: (req) => req.path === '/auth/login'` o montando `apiRateLimit()` después de `authRoutes` solo para lo autenticado.

#### M-3 — No hay "denegar por defecto": cada ruta debe acordarse de `requireAuth`

- **Dónde**: `apps/api/src/app.ts:95-105` (`authenticate` solo identifica; `requireAuth` se añade ruta por ruta en `routes/auth.ts:46,52,58` y `routes/tokens.ts:15`).
- **Requisito**: §4.1 ("todo salvo `GET /health`, `POST /auth/login` y `POST /webhooks/github` exige autenticarse"), RS-03.
- **Escenario**: no es explotable hoy (las cuatro rutas existentes lo llevan), pero la fase 2 agrega ~25 endpoints en varios archivos. Un `router.get('/cards/:ref/log', …)` sin `requireAuth` queda abierto a cualquiera que pase Cloudflare Access (o a cualquiera, si un día Access se desactiva por error). El error es silencioso: los tests del endpoint pasan igual.
- **Test que debería fallar hoy**: `§4.1 una ruta montada bajo /api/v1 sin requireAuth responde 401`: usar `extraRoutes` para montar `GET /_sin-guard` **sin** `requireAuth` y pedirla sin credencial → esperar **401** (hoy 200). Y `GET /health` y `POST /auth/login` siguen respondiendo sin credencial.
- **Corrección sugerida**: montar `/health` y `/auth/login` primero y luego `v1.use(requireAuth)` para todo lo demás; `/webhooks/github` (v2) se monta antes del `requireAuth` como excepción explícita. `requireAuth` deja de ser necesario en cada ruta (se puede conservar como documentación).

### Bajas

#### B-1 — Las rutas desconocidas responden el HTML de Express, no el JSON de §4.2

- **Dónde**: `apps/api/src/app.ts:107-108` (no hay handler de 404 antes de `errorHandler`).
- **Requisito**: §4.2 (`404 NOT_FOUND`), RS-16 (nada que no sea el formato de error).
- **Sonda**: `GET /api/v1/no-existe` → 404 `text/html` con `<pre>Cannot GET /api/v1/no-existe</pre>` (la ruta va escapada; no es XSS, pero la skill de Claude Code recibiría HTML donde espera JSON).
- **Test que debería fallar hoy**: `§4.2 ruta inexistente bajo /api/v1 responde 404 JSON NOT_FOUND`: `GET /api/v1/no-existe` con Bearer válido → `content-type` JSON y `body.error.code === 'NOT_FOUND'` (hoy HTML).
- **Corrección sugerida**: `v1.use((req, res, next) => next(new AppError('NOT_FOUND')))` al final del router v1 (después de `requireAuth` según M-3, para no dar un 404 informativo a quien no se autenticó).

#### B-2 — Las respuestas de la API no llevan `Cache-Control: no-store`

- **Dónde**: `apps/api/src/app.ts` (helmet no lo pone; Express agrega `ETag` débil a los JSON).
- **Requisito**: ninguno directo; higiene de RS-10/RS-13 (datos autenticados en caché del navegador, bfcache, o un proxy intermedio que un día decida cachear JSON).
- **Sonda**: `GET /me` con cookie → sin `cache-control`, con `etag: W/"…"`.
- **Test que debería fallar hoy**: `RS-10 las respuestas de /api/v1 llevan Cache-Control: no-store`: `GET /me` y `GET /tokens` con cookie → header `cache-control` contiene `no-store` (hoy ausente).
- **Corrección sugerida**: un middleware en `v1` que ponga `Cache-Control: no-store` (y opcionalmente `app.set('etag', false)` para la API).

#### B-3 — `password` sin longitud máxima en `loginBodySchema`

- **Dónde**: `packages/shared/src/schemas/auth.ts:5` (`z.string().min(1)`), con `express.json({ limit: '256kb' })` como único tope.
- **Requisito**: RS-07 (validar en el borde antes de trabajo costoso).
- **Escenario**: cada intento de login con una contraseña de 250 KB hace que argon2 procese ese tamaño. Con los parámetros de producción (`m=64 MiB, t=3`) el costo lo domina la memoria, no la longitud, y el limitador del login corta al sexto intento, así que el impacto es mínimo (sonda: 200 KB → 401 en 18 ms con el hash de test). Lo anoto porque es gratis cerrarlo.
- **Test que debería fallar hoy**: `RS-07 una contraseña de más de 1024 caracteres responde 400`: `POST /auth/login` con `password: 'a'.repeat(2000)` → 400 `VALIDATION_ERROR` (hoy 401 tras hashear).
- **Corrección sugerida**: `.max(1024)` (o el límite que Felipe quiera; argon2 acepta hasta 2^32 − 1 bytes, el máximo es solo para no hashear basura).

#### B-4 — `TRUST_PROXY` vacío o numérico en producción deja a todos con la misma IP

- **Dónde**: `apps/api/src/app.ts:21-27,47`; `.env.example` (`TRUST_PROXY=` sin comentario).
- **Requisito**: RS-05 (`trust proxy` configurado con la red Docker, no `true` a secas), RD-05.
- **Escenario**: en Nexus la cadena es Cloudflare → `cloudflared` → `nginx-proxy` → app. Con `TRUST_PROXY` vacío, `req.ip` es siempre la IP de `nginx-proxy`: el límite de login (5/15 min) y el general anónimo (600/15 min) pasan a ser **globales**. Con `TRUST_PROXY=1`, `req.ip` es la IP de `cloudflared`, igual de compartida. Solo la subred Docker (`172.x.0.0/16` de la red `web`) hace que Express llegue al primer salto no confiable, la IP real que puso Cloudflare. Un `X-Forwarded-For` falsificado por el cliente no sirve: Cloudflare **añade** la IP real al final, y Express recorre la lista desde la derecha. No es un fallo del código: es una variable que, mal puesta, convierte M-1/M-2 en algo que cualquiera que pase Access puede provocar.
- **Test que debería fallar hoy**: no hay un test de que el limitador use la IP de `X-Forwarded-For`. Propuesta: con `TRUST_PROXY=127.0.0.1` (Supertest conecta desde loopback) y `X-Forwarded-For: 203.0.113.5`, cinco logins fallidos → el sexto con `X-Forwarded-For: 203.0.113.6` responde **401** (otra IP, otra cuota), y con `203.0.113.5` responde 429. Sin `TRUST_PROXY`, los dos responderían 429 (una sola cuota).
- **Corrección sugerida**: el test anterior; un `logger.warn` al arrancar si `NODE_ENV=production` y `TRUST_PROXY` está vacío; y un comentario en `.env.example` ("subred Docker de la red `web`, p. ej. `172.18.0.0/16`").

#### B-5 — `ADMIN_PASSWORD_HASH` no se valida al arrancar

- **Dónde**: `apps/api/src/server.ts:11-16` (solo comprueba que no esté vacío); `apps/api/src/auth/password.ts:9-11`.
- **Requisito**: RS-02 (argon2**id**), RS-16.
- **Escenario**: (a) un hash mal pegado (truncado, sin las comillas simples que el `$` exige en `.env`) hace que **cada** login lance desde `argon2.verify` y responda 500 `INTERNAL`, con un `log.error` por intento; el proceso arranca "sano". (b) Un hash `$argon2i$` o uno con parámetros débiles (como el de `.env.test`, `m=4096,t=1,p=1`) se acepta en silencio porque `verify` usa los parámetros embebidos.
- **Test que debería fallar hoy**: `RS-02 el arranque rechaza un ADMIN_PASSWORD_HASH que no sea argon2id bien formado`: una función `assertPasswordHash(value)` (nueva) que lance con `'no-es-un-hash'`, con `'$argon2i$v=19$…'` y con un argon2id truncado, y acepte la salida de `hashPassword('x')`. Hoy no existe la función; en HTTP, `createApp` con `ADMIN_PASSWORD_HASH='basura'` → login responde 500 (debería ser imposible llegar ahí).
- **Corrección sugerida**: validar al arrancar con una regex `^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$` y, opcionalmente, un mínimo de `m` (p. ej. 19456 KiB, el mínimo OWASP) para que un hash de test no acabe en producción.

#### B-6 — `fallbackLogger` sin redacción

- **Dónde**: `apps/api/src/http/errors.ts:56-58,85`.
- **Requisito**: RS-11.
- **Escenario**: hoy solo se usa cuando no hay `req.log` (tests de middlewares sueltos). Si mañana alguien registra con él un objeto que contenga `req`, no se redacta nada. Comprobé que por los caminos actuales no se filtra nada: `errorHandler` registra `{ err }` y los errores de body-parser que llevan el body crudo (`entity.parse.failed`) se interceptan antes de loguear; el `password` solo vive en `req.body` y nunca entra a una consulta. Sonda: un JSON malformado con la contraseña dentro no aparece en la salida de pino.
- **Test que debería fallar hoy**: ninguno funcional. Propuesta de regresión: un test que lance desde una ruta un `Error` con una propiedad `headers: { authorization: 'Bearer secreto' }` enumerable y compruebe que `secreto` no aparece en la salida de pino (hoy pasa con `req.log` de pino-http y fallaría con el fallback).
- **Corrección sugerida**: construir el fallback con `createLogger()` de `logger.ts` (misma redacción) en lugar de `pino({...})` directo.

### Informativos (sin acción obligatoria)

- **I-1 Precedencia Bearer/cookie verificada**: `Authorization` vacío, `Basic …`, `Bearer` sin valor, basura y 5000 caracteres responden 401 **sin** caer a la cookie (test existente + sonda). Un Bearer inválido **no** borra la cookie que venía al lado (`clearCookie: false`); §4.2 dice "con cookie, la respuesta además borra la cookie", que se puede leer de las dos formas. La implementación me parece la correcta (un script con un token vencido no debería cerrar la sesión de la UI); ver decisión D-2.
- **I-2 CSRF**: `Origin` se compara exacto; `null`, mayúsculas y barra final responden 403 (sonda). `appOrigin === ''` falla cerrado. Métodos cubiertos: POST, PATCH, PUT, DELETE; Express solo enruta esos más GET/HEAD/OPTIONS. **Ningún GET modifica datos de negocio**; el único efecto colateral de un GET es `last_seen_at` (vencimiento deslizante), y `SameSite=Strict` impide que un sitio ajeno mantenga viva la sesión. Un `OPTIONS` preflight no recibe `Access-Control-Allow-*` (test existente).
- **I-3 Cookie**: `__Host-lb_session=<43 base64url>; Path=/; Secure; HttpOnly; SameSite=Strict`, sin `Max-Age`/`Expires`/`Domain`; borrado con `Max-Age=0`; rotación en login con cookie válida previa (tests existentes). Sin `secret` en `cookie-parser` (no hay cookies firmadas; no hacen falta). El valor de la cookie se valida con regex antes de tocar la base.
- **I-4 Vencimientos**: `now >= expiresAt` y `now >= lastSeenAt + 12 h` → inválida, exactamente como "válida si `now < …`" en §3. `last_seen_at`/`last_used_at` se actualizan como mucho una vez por minuto con la condición dentro del `UPDATE` (atómico). Consecuencia cosmética: `idleExpiresAt` en `/me` puede ir hasta 59 s por detrás del real, y el vencimiento efectivo por inactividad es 12 h + hasta 59 s. Aceptable.
- **I-5 Hash y comparación**: tokens `lb_<8>.<43>` (6 + 32 bytes aleatorios), SHA-256 hex, búsqueda por `prefix` (UNIQUE) y `timingSafeEqual` sobre los 32 bytes del hash. `verifyToken` retorna antes de comparar cuando el prefijo no existe: ese oráculo de tiempo solo revela si un prefijo existe, y el prefijo no es secreto (va en `/me`, en `/tokens` y en los logs). Sesiones: búsqueda directa por `id_hash` (UNIQUE), como manda RS-10.
- **I-6 Login**: 401 genérico `Contraseña incorrecta` sin `Set-Cookie`; un solo usuario, no hay enumeración. argon2 es constante respecto al contenido de la contraseña.
- **I-7 Logs**: pino-http con serializers propios (`id`, `method`, `url` sin query, `statusCode`, `auth` = `token:<prefijo>` / `session:<uuid>`), sin headers ni bodies, más `redact` de los cinco headers de RS-11 como segunda capa. La sonda confirma que ni el token, ni el secreto, ni el valor de la cookie, ni la query string, ni la contraseña de un JSON malformado aparecen en la salida. `errorHandler` registra `{ err }` con stack (correcto en servidor; al cliente va solo `INTERNAL`). Ojo en fase 2: un `QueryFailedError` de TypeORM lleva `parameters` enumerables, que pino serializa; hoy ningún parámetro es secreto (hashes, prefijo, nombre), y así debe seguir.
- **I-8 Errores**: `AppError` → formato §4.2; `entity.too.large` → 413; `entity.parse.failed` → 400; `charset=utf-16` → 400 (sonda); errores inesperados → 500 sin mensaje ni stack (tests existentes). Express 5 propaga rechazos de handlers async.
- **I-9 Cabeceras**: CSP idéntica a RS-08, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, sin `X-Powered-By`; helmet añade además HSTS (`max-age=31536000; includeSubDomains`, redundante detrás de Cloudflare pero inocuo), `X-Frame-Options: SAMEORIGIN` (más `frame-ancestors 'none'`), `Cross-Origin-Opener-Policy` y `Cross-Origin-Resource-Policy: same-origin`. Nota para la fase 3: `style-src 'self'` sin `'unsafe-inline'` permite estilos puestos por CSSOM (`style` prop de React, `@dnd-kit`) pero bloquea `<style>` inyectados por librerías; si alguna lo hace, se verá en la consola del navegador, no se relaja la CSP.
- **I-10 `/health`**: pasa por `authenticate` (si la petición trae cookie o Bearer, consulta la base) y por el limitador (M-2). `SELECT 1` con timeout de 2 s. Sin auth, como pide §4.12.
- **I-11 Carga de `.env`**: `loadEnv()` lee `<raíz>/.env` sin pisar el entorno (en Docker manda `env_file`); `loadTestEnv()` pisa con `.env.test` para que los tests siempre apunten a `db-test` (5436). `server.ts` exige `DATABASE_URL`, `APP_ORIGIN` y `ADMIN_PASSWORD_HASH`. `.env` y `.env.local` ignorados por git. El hash argon2 contiene `$`: en `.env` va entre comillas simples (como en `.env.test`).
- **I-12 `.env.test`**: `DATABASE_URL` con `logbook_test` (solo `127.0.0.1:5436`, tmpfs) y `ADMIN_PASSWORD_HASH` del literal `test-password-1234` con parámetros mínimos (`m=4096,t=1,p=1`) para que los tests sean rápidos. Claramente de test; aceptable versionado. Que no se copie nunca a un `.env` (B-5 lo impediría si se añade el mínimo de `m`).
- **I-13 `hash-password`**: lee sin eco en TTY (raw mode) y por stdin sin TTY; solo el hash va a stdout; produce `m=65536,t=3,p=4` (por encima del mínimo OWASP para argon2id). En Git Bash/mintty `process.stdin.isTTY` puede ser falso y la contraseña se escribe con eco: usar PowerShell o Windows Terminal, o `echo` por tubería desde un script.
- **I-14 Dependencias nuevas**: `argon2@0.45.1` (addon nativo con binarios precompilados; en fase 8 verificar que `node:22-alpine` resuelva el prebuilt `linux-musl` o instale `build-base`), `cookie-parser@1.4.7`, `pino-http@11.0.0`, `express-rate-limit@8.7.1` (valida la configuración de `trust proxy` y avisa por log si ve `X-Forwarded-For` sin confiar en el proxy, útil para B-4), `helmet@8.3.0`. `pnpm audit --audit-level=high`: sin vulnerabilidades.
- **I-15 Validación**: `z.object` elimina claves desconocidas; `name` del token `trim().min(1).max(80)` coincide con `varchar(80)`; `:id` de `DELETE /tokens/:id` validado como uuid (400 si no). `validate` reemplaza `params`/`query`/`body` por lo parseado.
- **I-16 Esquema**: `api_token.expires_at NOT NULL`, `prefix UNIQUE`, `session.id_hash UNIQUE`, como §3; `synchronize: false` siempre (los tests corren las migraciones reales, mejor que lo que pedía el plan). `purgeSessions` al arrancar y cada 24 h con `unref()`.
- **I-17 Código solo para tests en producción**: `AppOptions.extraRoutes` existe para montar la ruta sonda. Aceptable; el riesgo es cero porque solo `createApp` en tests la pasa.

## Decisiones para Felipe

- **D-1** `SameSite` de la cookie de Cloudflare Access: ponerla en `Strict` (o al menos `Lax`) en la configuración de la aplicación de Access. Cierra en el borde el vector de M-1/M-2 y no cuesta nada; igual corregir M-1/M-2 en la app.
- **D-2** ¿Un Bearer inválido que viene junto a una cookie válida debe borrar la cookie? Hoy no la borra. Recomiendo dejarlo así y aclarar la frase de §4.2 ("con cookie, la respuesta además borra la cookie" → "cuando la credencial que falló fue la cookie").
- **D-3** ¿Denegar por defecto (M-3) ahora o al abrir la fase 2? Recomiendo ahora, junto con M-1 y M-2, antes de que existan 25 rutas más.
- **D-4** Longitud máxima de contraseña (B-3): propongo 1024.
- **D-5** Mínimo de `m` para `ADMIN_PASSWORD_HASH` (B-5): propongo rechazar `m < 19456` al arrancar, para que el hash de test no pueda acabar en producción.
