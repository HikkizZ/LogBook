# Logbook — plan de implementación

Orden de trabajo. **Sonnet programa y testea**, **Opus coordina, revisa cada cierre de fase y commitea**, **Fable revisa seguridad y código** en tres puntos de control, **yo decido y despliego**. Todo sale de [[01_especificacion]] (qué), [[02_diseno]] (cómo se ve) y de las decisiones de [[00_logbook]].

Repo: `C:\Users\fmira\Projects\LogBook-Zytech` → `github.com/HikkizZ/LogBook` (**privado**). Estructura: **monorepo pnpm** con `apps/api`, `apps/web`, `packages/shared` ([pregunta 2] cerrada).

Las tareas van numeradas `F.n`. Las marcadas **∥** pueden hacerse en paralelo con las otras **∥** de la misma fase porque no comparten archivos. Cada tarea tiene un "Listo cuando" medible y los comandos para comprobarlo; **no se da por hecha sin correrlos**.

---

## Reglas para quien programe

1. **La spec manda**: endpoints, campos, códigos de error y nombres salen de [[01_especificacion]]. Si algo no está, se deja un `TODO(spec)` visible y se pregunta; no se inventa.
2. **El diseño manda**: tokens, tamaños y estados salen de [[02_diseno]]. Cero colores ni tamaños sueltos en componentes.
3. **TypeScript `strict`, ESModules siempre** (`"type": "module"` en todos los `package.json`, `"module": "NodeNext"` en la API, imports con extensión `.js` donde NodeNext lo exija). Sin `any`, sin `require`.
4. **Solo pnpm**. Nunca `npm install` ni `yarn`. `pnpm-lock.yaml` versionado; `package-lock.json` prohibido.
5. **Tests primero cuando sea posible**: cada endpoint se cubre con Supertest contra una base de datos real de test (Postgres en Docker, nunca mocks del repositorio). Cada regla de negocio (RF-14, RF-15, RF-16, RS-01…) tiene al menos un test que la cita por ID en el nombre.
6. **Migraciones explícitas** con TypeORM (`migration:generate` + revisión a mano). `synchronize: true` solo en el `DataSource` de tests.
7. **Validación con Zod** en el borde (body, query, params). Los esquemas viven en `packages/shared` y los importa el frontend.
8. **Sin dependencias nuevas sin justificar**: cada paquete se explica en el commit. `pnpm audit` limpio de altas/críticas al cerrar cada fase.
9. **Un commit por paso lógico**, Conventional Commits, con el ID de la tarea en el cuerpo (`Tarea 2.3`). **Nunca `git push` sin mi confirmación.** Los commits los hace Opus.
10. **Nada de secretos en el repo**: `.env` ignorado, `.env.example` con todas las claves vacías. Los tests usan `.env.test` sin secretos reales.
11. **Puertos**: API `3200`, web `3201`, Postgres dev `127.0.0.1:5435`, Postgres test `127.0.0.1:5436` ([pregunta 8] cerrada). **Postgres siempre el 18 de Docker** (`docker-compose.dev.yml`), nunca el Postgres 16 instalado en el PC: no tiene `uuidv7()` y las migraciones fallarían ([pregunta 9] cerrada).
13. **Reloj inyectable en lo que expira**: los servicios de sesión y de tokens comparan fechas con `Date.now()` en la app (no con `now()` de Postgres), para que los tests de vencimiento usen `vi.useFakeTimers()` + `vi.setSystemTime()` sin esperar ni tocar la BD.
12. **Contenido genérico también en los seeds y tests**: nada de nombres reales de clientes ni datos de SIGA en fixtures.

Comandos de verificación estándar (desde la raíz del monorepo), usados en los "Listo cuando":

```
pnpm typecheck     # tsc --noEmit en los tres paquetes
pnpm lint          # eslint + prettier --check
pnpm test          # vitest run en api y web
pnpm build         # api: tsc; web: vite build
pnpm audit --audit-level=high
```

---

## Fase 0 — Setup del repo

| Tarea | Qué | Listo cuando |
|---|---|---|
| 0.1 | En `C:\Users\fmira\Projects\LogBook-Zytech` (ya existe, con `git init` en `main` y la spec commiteada): `pnpm init`, `pnpm-workspace.yaml` con `apps/*` y `packages/*`, `"packageManager": "pnpm@<versión actual>"`. `.gitignore` (node_modules, dist, .env, coverage). `.editorconfig`. | `pnpm install` corre sin errores en un repo vacío; `git status` limpio tras el primer commit. |
| 0.2 ∥ | `packages/shared`: `package.json` (`"type": "module"`), `tsconfig` strict, `src/index.ts` exportando un tipo de prueba y un esquema Zod de prueba. Dependencia: `zod`. | `pnpm --filter shared typecheck` pasa. |
| 0.3 ∥ | `apps/api`: Express 5 + TypeScript (`NodeNext`), `tsx` para dev, `tsc` para build, pino, helmet, `express-rate-limit`, TypeORM + `pg`, `dotenv`. `src/server.ts` con `GET /api/v1/health` que responde `{ ok: true, db: false }` (sin BD aún). Scripts: `dev` (puerto 3200), `build`, `start`, `typecheck`, `test`. | `pnpm --filter api dev` responde en `curl.exe -s localhost:3200/api/v1/health`; `pnpm --filter api build` genera `dist/` ESM (sin `require` en el output: `grep -r "require(" dist` vacío). |
| 0.4 ∥ | `apps/web`: `pnpm create vite` (react-ts), Tailwind v4 (`@tailwindcss/vite`), `@fontsource-variable/inter`, React Router, `vite.config.ts` con puerto 3201 y `server.proxy['/api'] → http://localhost:3200`. Página vacía "Logbook". | `pnpm --filter web dev` sirve en 3201 y `/api/v1/health` responde a través del proxy; `pnpm --filter web build` genera `dist/`. |
| 0.5 | Raíz: ESLint (flat config, typescript-eslint, react-hooks, import ordering) + Prettier; scripts raíz `typecheck`, `lint`, `test`, `build` que recorren los workspaces (`pnpm -r`). Vitest configurado en `api` (entorno node) y `web` (jsdom + Testing Library) con un test trivial en cada uno. | Los cinco comandos estándar pasan en verde. |
| 0.6 | `docker-compose.dev.yml` con dos **`postgres:18-alpine`** (la misma imagen que en Nexus; **no** se usa el Postgres 16 instalado en el PC, [pregunta 9]): `db-dev` (`127.0.0.1:5435`, volumen con nombre) y `db-test` (`127.0.0.1:5436`, `tmpfs` para que sea rápido y efímero). `.env.example` y `.env.test` (apunta a 5436, `APP_ORIGIN=http://localhost:3201`). Script raíz `db:up` / `db:down`. | `pnpm db:up` levanta ambos; `docker exec ... pg_isready` responde en los dos puertos; `docker exec ... psql -U logbook -c "SELECT uuidv7()"` devuelve un uuid en cada uno (confirma que es 18 y no el local). |
| 0.7 | README mínimo: qué es, cómo levantar en dev, comandos. Actualizar `launch.json` del vault (si existe) para levantar API y web. | README cubre `pnpm install && pnpm db:up && pnpm dev` de punta a punta en un clon limpio. |

**Fase 0 lista cuando**: clon limpio → `pnpm install && pnpm db:up && pnpm dev` deja API y web arriba; los cinco comandos estándar pasan; `pnpm-lock.yaml` commiteado; no existe `package-lock.json`.

---

## Fase 1 — Backend: base de datos y autenticación

| Tarea | Qué | Listo cuando |
|---|---|---|
| 1.1 | `DataSource` de TypeORM (`src/db/data-source.ts`) leyendo `DATABASE_URL`; configuración de migraciones; `src/migrate.ts` que corre las migraciones pendientes y sale. Script `migration:generate`, `migration:run`. | `pnpm --filter api migration:run` contra `db-dev` crea la tabla `migrations`. |
| 1.2 | Migración inicial con **todo el esquema de v1** de [[01_especificacion]] §3: enums, secuencia `card_number_seq`, tablas `project`, `card`, `label`, `card_label`, `checklist_item`, `log_entry`, `api_token` (con `expires_at NOT NULL`), `session`, `app_setting`, columnas `tsvector` generadas, índices y `CHECK`s. Seed en la misma migración: proyecto `Personal`, 6 etiquetas, settings por defecto. Entidades TypeORM correspondientes en `src/entities/`. | La migración sube y baja limpia (`migration:run` → `migration:revert` → `migration:run`); `\d card` muestra la columna `search` generada y el índice GIN; `\d session` muestra `id_hash` UNIQUE; `SELECT count(*) FROM label` = 6. |
| 1.3 | `src/test/setup.ts`: antes de cada archivo de test, conectar a `db-test`, correr migraciones, truncar tablas entre tests. `src/app.ts` con `createApp()` que arma la app Express **sin escuchar puerto** (en 1.3 solo monta `/health`; 1.7 le agrega el resto) y `src/server.ts` que la escucha. Helper de test `app()` que llama a `createApp()`, para Supertest. | Un test de ejemplo inserta un proyecto y lo lee; `pnpm --filter api test` pasa en < 10 s. |
| 1.4 ∥ | **Tokens de API** (RS-01), módulo puro + BD, **sin tocar `app.ts`**: `src/auth/tokens.ts` con `generateToken()` → `{ token: "lb_<id8>.<base64url 32 bytes>", prefix, hash }`, `hashToken()`, `createToken(name)` (fija `expires_at = now + 90 d`), `verifyToken(raw, now)` que busca por prefijo, compara con `timingSafeEqual`, rechaza revocados y vencidos y actualiza `last_used_at` como mucho una vez por minuto; `revokeToken(id)`. | Tests sobre las funciones (sin HTTP): token válido pasa; prefijo correcto y secreto incorrecto → rechazado; revocado → rechazado; **con el reloj en `created_at + 90 d + 1 s` → rechazado, en `+ 90 d − 1 s` → pasa** (`vi.setSystemTime`); `last_used_at` no se actualiza dos veces en el mismo minuto; `expires_at` de un token recién creado = `created_at + 90 d` exacto. En BD nunca hay un token en claro (test que lee la tabla y verifica que `token_hash` tenga 64 hex). |
| 1.5 ∥ | **Sesiones** (RS-03, RS-10), módulo puro + BD, **sin tocar `app.ts`**: `src/auth/sessions.ts` con `createSession(now)` → `{ sessionId (32 bytes base64url), row }` guardando solo `id_hash`, `expires_at = now + 7 d`, `last_seen_at = now`; `verifySession(sessionId, now)` que busca por `sha256(sessionId)`, rechaza si `revoked_at`, si `now ≥ expires_at` o si `now ≥ last_seen_at + 12 h`, y si pasa actualiza `last_seen_at` como mucho una vez por minuto; `revokeSession(id)`, `revokeAllSessions()`, `purgeSessions(now)` (borra vencidas/revocadas). `src/auth/cookie.ts` con `sessionCookie(sessionId)` y `clearSessionCookie()` que devuelven el string exacto de `Set-Cookie` (`__Host-lb_session=...; Path=/; Secure; HttpOnly; SameSite=Strict`, sin `Max-Age`; el de borrar lleva `Max-Age=0`). | Tests sobre las funciones con reloj simulado (`vi.useFakeTimers` + `vi.setSystemTime`): sesión recién creada pasa; **a las 11 h 59 min sin uso pasa y a las 12 h 00 min 01 s no**; una sesión usada cada hora durante 6 días pasa y **al llegar a los 7 d desde `created_at` no, aunque la última petición fue hace 1 h**; revocada → no; `revokeAllSessions()` deja todas con `revoked_at`; `purgeSessions` borra solo vencidas/revocadas; `id_hash` tiene 64 hex y el `sessionId` en claro no aparece en la tabla. Test del string de cookie: contiene exactamente `Path=/`, `Secure`, `HttpOnly`, `SameSite=Strict`, empieza por `__Host-lb_session=`, **no** contiene `Max-Age`, `Expires` ni `Domain`; el de borrado contiene `Max-Age=0`. |
| 1.6 ∥ | **Errores y validación** (RS-07, §4.2), módulos puros, **sin tocar `app.ts`**: `src/http/errors.ts` (`AppError` con `code`/`status`, incluidos `UNAUTHORIZED` 401 y `FORBIDDEN` 403), `errorHandler` global que devuelve el formato de §4.2 y nunca el stack; `validate(schema)` middleware con Zod para body/query/params. Esquemas base en `packages/shared/src/schemas/`. | Tests montando los middlewares en una app Express mínima del propio test (no `createApp`): body inválido → 400 con `details[].path`; error inesperado → 500 con `{ error: { code: "INTERNAL" } }` sin stack; `AppError("FORBIDDEN")` → 403 con `code: "FORBIDDEN"`. |
| 1.7 | **Armado de la app y middlewares de auth** (RS-05, RS-08, RS-09, RS-10, RS-13, RS-16). Único lugar que edita `app.ts`: helmet con la CSP exacta de RS-08, `trust proxy` desde `TRUST_PROXY`, `express.json({ limit: "256kb" })`, `cookie-parser`, pino-http con redacción de `authorization`, `cookie`, `set-cookie`, `cf-access-client-secret`, `x-hub-signature-256`, sin bodies, y el campo `auth` del log como `token:<prefijo>` / `session:<id interno>`. Middlewares en `src/auth/middleware.ts`: `requireAuth` (precedencia de §4.1: si hay `Authorization` → solo Bearer, fallo = 401 sin mirar la cookie; si no, cookie; 401 con cookie también manda `clearSessionCookie()`); deja `req.auth = { via: "token" | "session", ... }`. `csrfGuard` (solo si `req.auth.via === "session"` y método `POST/PATCH/PUT/DELETE`: `Origin === APP_ORIGIN` exacto **y** `X-Logbook-CSRF: 1`, si no 403). `requireSession` (`via !== "session"` → 403). Rate limit general `600/15 min` con clave `token:<id>` / `session:<id>` / IP, y el `errorHandler` de 1.6 al final. Depende de 1.4, 1.5 y 1.6. | `curl.exe -sI` muestra `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`; body > 256 KB → 413. Tests de `requireAuth` sobre una ruta de prueba `GET /api/v1/_auth-probe` (solo en tests): sin nada → 401; Bearer válido → 200 con `via: "token"`; cookie válida → 200 con `via: "session"`; **Bearer vencido + cookie válida → 401** (no cae a la cookie); cookie vencida → 401 **y** `Set-Cookie` con `Max-Age=0`. Tests de `csrfGuard` sobre `POST /_auth-probe`: cookie + `Origin` correcto + header → 200; **cookie sin header → 403**; **cookie con `Origin: https://evil.example` → 403**; cookie sin `Origin` → 403; `GET` con cookie sin header → 200; **Bearer sin header ni `Origin` → 200** (no requiere CSRF). Test de logs: una petición con `Authorization` y una con `Cookie` no dejan ni el token ni el ID de sesión en la salida de pino. |
| 1.8 | **Endpoints de autenticación** (§4.1, RS-02, RS-05): `POST /auth/login` (argon2id contra `ADMIN_PASSWORD_HASH`; pasa `csrfGuard` aunque no haya cookie; rota: revoca la sesión de la cookie entrante si era válida; responde 204 + `Set-Cookie`), `POST /auth/logout` (revoca + borra cookie), `POST /auth/logout-all` (revoca todas + borra cookie), `GET /me` (forma según `via`). Los tres `POST` con `requireSession` salvo login. Rate limit `5/15 min` por IP en login. Script `hash-password` (`pnpm --filter api hash-password`) que pide la contraseña por stdin y escribe el hash. `purgeSessions()` al arrancar y cada 24 h (`setInterval` con `unref()`). Depende de 1.7. | Tests (Supertest, con la cookie que devuelve el `Set-Cookie` del login): contraseña correcta → 204 y `Set-Cookie` con los flags de 1.5; luego `/me` → 200 `auth: "session"` con `expiresAt` = login + 7 d e `idleExpiresAt` = ahora + 12 h; incorrecta → 401 sin `Set-Cookie`; sexto intento en 15 min → 429; login sin `X-Logbook-CSRF` → 403; **login con una cookie válida previa deja esa sesión revocada y emite otro ID** (dos `/me` con la cookie vieja → 401); logout → `/me` con esa cookie → 401; **`logout-all` desde la sesión A deja A y B (dos logins) en 401**; `logout`, `logout-all` y `/me` con Bearer: `/me` → 200 `auth: "token"`, los otros dos → 403; **`vi.setSystemTime` a login + 12 h 1 min sin peticiones → `/me` 401**; **peticiones cada hora hasta login + 7 d → 401 en la siguiente**. |
| 1.9 | **Tokens API** (§4.9, RS-03): `GET/POST/DELETE /tokens` con `requireSession`. Depende de 1.8 (los tests necesitan hacer login). | Tests: crear devuelve `token` una vez y `expiresAt` = ahora + 90 d; listar no devuelve hash ni token y sí `expiresAt`; revocar → ese token da 401 en `/me`; **`POST /tokens` con Bearer → 403** (`code: "FORBIDDEN"`), igual `GET` y `DELETE`; con el reloj en `+ 90 d + 1 s` el token creado responde 401 en `/me`. |

**Fase 1 lista cuando**: comandos estándar en verde; `pnpm --filter api test` cubre RS-01, RS-02, RS-03, RS-05, RS-07, RS-10 con tests que citan el ID; desde el navegador (`http://localhost:3201`, tras el proxy de Vite) un `fetch('/api/v1/auth/login', …)` en la consola deja una cookie que DevTools muestra con `HttpOnly`, `Secure`, `SameSite=Strict` y sin fecha de expiración, y `document.cookie` no la lista; `curl.exe` a `/me` con un token creado desde `/tokens` responde 200.

---

## Fase 2 — Backend: dominio completo (proyectos, tarjetas, bitácora, búsqueda)

Todas las rutas bajo `/api/v1`, con `requireAuth`. Estructura sugerida: `src/modules/<modulo>/{router,service,schemas,*.test}.ts`.

| Tarea | Qué | Listo cuando |
|---|---|---|
| 2.1 ∥ | **Proyectos** (§4.3, RF-01..05): CRUD, slug inmutable generado con `slugify`, `cardCounts` por estado, archivar/desarchivar, 409 al archivar el único activo, 409 por nombre duplicado entre activos. | Tests por cada RF; `GET /projects` devuelve `cardCounts` correctos tras crear tarjetas en varios estados. |
| 2.2 ∥ | **Etiquetas** (§4.7, RF-23): CRUD, unicidad case-insensitive, borrar quita de tarjetas. | Tests: `Bug` y `bug` → 409; borrar etiqueta deja `card_label` sin filas de ella. |
| 2.3 | **Tarjetas** (§4.4, RF-20..29): `GET /cards` con filtros y cursor; `POST`; `GET /cards/:ref` (acepta `T-42` y uuid) con checklist, últimos 50 log y `branchName`; `PATCH` (sin `status`); archivar/desarchivar; mover de proyecto (RF-28). `position` = último de la columna al crear. Resolver `:ref` en un middleware `loadCard`. | Tests: `T-1` y `T-01` resuelven igual; `T-999` → 404; `PATCH` con `status` → 400; filtro `status=in_progress,blocked` funciona; `branchName` da `fix/T-7-titulo-slug` si tiene etiqueta `bug`; mover de proyecto conserva número y bitácora. Depende de 2.1 y 2.2. |
| 2.4 | **Move** (`POST /cards/:ref/move`, RF-13..16) en una transacción: renumerar origen y destino, `start_date` al entrar a `in_progress` si estaba vacío, `completed_at` al entrar/salir de `done`, entrada `moved` (+ `blocked` con `reason`), `source` según `kind` del token, 400 si `blocked` sin `reason`. Mismo estado con `position` distinta: reordena, **sin** entrada. | Tests que citan RF-14, RF-15, RF-16 por nombre; test de concurrencia simple (dos moves seguidos dejan posiciones `0..n-1` sin huecos ni duplicados); WIP superado **no** devuelve error (test explícito de RF-13). Depende de 2.3. |
| 2.5 ∥ | **Checklist** (§4.5, RF-24): crear, editar, marcar, reordenar, borrar; `checklistDone/Total` en `Card`. | Tests: `2/5` correcto tras marcar dos; reordenar deja posiciones consecutivas. Depende de 2.3. |
| 2.6 ∥ | **Bitácora** (§4.6, RF-30..33): `GET/POST /cards/:ref/log`, `PATCH/DELETE /log/:id` (editar solo `note`/`blocked`), `occurredAt` opcional. `GET /log` agregado por día → proyecto → tarjeta, con `moved: [Card]` del período, zona horaria del `timezone` de `/settings` (`APP_TIMEZONE` solo la inicializa; decidido 2026-10-21, ver 2.11). | Tests: una entrada con `occurredAt` a las 23:30 de Santiago cae en ese día y no en el siguiente UTC; editar una `moved` → 400; `GET /log?from&to` agrupa correctamente tres proyectos. Depende de 2.3. |
| 2.7 | **Resumen** (`GET /summary`, RF-43): genera el markdown exacto del formato de la spec desde la misma consulta de 2.6; `format=json` devuelve la estructura. Número de semana ISO. | Test de snapshot del markdown con un fixture fijo (3 proyectos, 5 tarjetas, entradas de nota y de sistema). Depende de 2.6. |
| 2.8 ∥ | **Búsqueda** (§4.8, RF-50..52): `tsvector` `spanish` con `plainto_tsquery`, `ts_headline` para el fragmento, `ILIKE` de respaldo para prefijos; `T-<n>` exacto primero; `q` < 3 → 400. | Tests: "migración" encuentra "migracion" (sin `unaccent`: lo cubre el respaldo `ILIKE` sin tildes; se deja así y se mide, `unaccent`/`pg_trgm` solo si se vuelve lenta, decidido 2026-10-21); `T-3` devuelve esa tarjeta primero; entradas de bitácora aparecen con su tarjeta. Depende de 2.3 y 2.6. |
| 2.9 ∥ | **Settings** (§4.12) y `GET /health` con `db: true` real (consulta `SELECT 1`). | Tests triviales; healthcheck responde `503` si la BD no contesta. |
| 2.10 | Documento `docs/api.md` generado a mano desde los esquemas Zod (o `zod-to-openapi` si cuesta lo mismo: justificar). Lo usa la skill. | Cada endpoint de §4 aparece con ejemplo de request y response. |
| 2.11 | **Aplicar decisiones del 2026-10-21** ([[00_logbook]] → "Decisiones de la fase 2"). Solo las que cambian código; las demás ya están implementadas y quedaron anotadas en la spec. (13) `timezone` de `app_setting` manda sobre `APP_TIMEZONE` en `/log`, `/summary` y en "hoy" de RF-15; `APP_TIMEZONE` solo siembra el valor inicial. (14) `POST /projects` sin `wipLimit` usa `wipDefault`. (15) `move` y `PATCH /cards/:ref` sobre una tarjeta de proyecto archivado → 409. (17) `date` y `occurredAt` acotadas a `1970-01-01..2100-12-31` en todos los esquemas, filtros incluidos. (18) `POST /cards` con `status: blocked` exige `reason` y crea la entrada `blocked`. (19) `/summary` escapa títulos de tarjeta y nombres de proyecto como texto markdown (y `commit`/`pr` cuando existan); cuerpos `note`/`blocked` tal cual. (20) `GET /log` y `/summary?format=json` devuelven el `Card` sin `description`. (21) `GET/POST /tokens` devuelven `prefix` con `lb_`. Al terminar, actualizar `docs/api.md` (§10 y §11) y la skill si cambia el contrato. Depende de 2.1..2.10. | Tests que citan la decisión por número: (13) con `PATCH /settings { timezone: "Asia/Tokyo" }` y `APP_TIMEZONE=America/Santiago`, una entrada a las 23:30 de Santiago cae en el día siguiente en `GET /log`, y `move` a `in_progress` pone `startDate` del día de Tokio; (14) `PATCH /settings { wipDefault: 5 }` → `POST /projects` sin `wipLimit` devuelve `wipLimit: 5`, con `wipLimit: 2` devuelve 2; (15) archivar un proyecto → `move` y `PATCH` de una tarjeta suya → 409 `CONFLICT`, desarchivar → 200; (17) `dueDate: "1969-12-31"`, `"2101-01-01"`, `occurredAt: "0000-01-01T00:00:00Z"` y `GET /cards?due_before=2101-01-01` → 400 con `details[].path`; `"1970-01-01"` y `"2100-12-31"` → aceptadas; (18) `POST /cards { status: "blocked" }` sin `reason` → 400 `path: "reason"`; con `reason` → 201 y `GET /cards/:ref/log` tiene una entrada `blocked` con ese cuerpo y ninguna `moved`; (19) tarjeta con título ``a [b](c) *d* `e` `` y proyecto `x_y` → `/summary` contiene el título y el nombre escapados y no `[b](c)` crudo; una `note` con `**negrita**` sale sin escapar; (20) `GET /log` y `/summary?format=json`: ningún `card` de `days[]` tiene la clave `description` (`moved[]` sí es `Card` completo); (21) `POST /tokens` y `GET /tokens` devuelven `prefix` que empieza por `lb_` e igual al de `GET /me` con ese token. Cobertura sigue ≥ 80 % y `scripts/smoke.sh` pasa. |

**Fase 2 lista cuando**: comandos estándar en verde; cobertura de `apps/api` ≥ 80 % líneas (`vitest --coverage`); un script de humo `scripts/smoke.sh` con curl crea proyecto, tarjeta, nota, mueve a bloqueado con motivo, busca y pide `/summary`, y todo responde lo esperado; la tarea 2.11 está cerrada y `docs/api.md` §11 ya no lista diferencias marcadas con ⚑.

**🔒 Revisión de Fable #1 (seguridad de la API)**: con la API completa, Fable revisa contra RS-01..RS-18: tokens y su vencimiento, sesiones (los dos vencimientos se validan en el servidor), flags de la cookie, precedencia Bearer/cookie, CSRF (`Origin` + header) en **todas** las rutas que modifican, ningún `GET` que modifique, rate limit, validación, errores sin stack, logs sin token ni ID de sesión, CSP. Devuelve una lista; Sonnet corrige antes de la fase 3.

---

## Fase 3 — Frontend: sistema de diseño y layout

| Tarea | Qué | Listo cuando |
|---|---|---|
| 3.1 | `src/styles/global.css` con `@theme` y **todos** los tokens de [[02_diseno]] §2 (colores, paleta de proyectos y etiquetas, tipografía, radios, sombras). Inter autoalojada. Reset mínimo. | `grep -rn "#[0-9A-Fa-f]\{6\}" src/components src/pages` devuelve 0 fuera de `global.css`. |
| 3.2 ∥ | Cliente de API `src/api/client.ts`: `fetch` con `credentials: "same-origin"` (la cookie la manda el navegador; el cliente **no** maneja ningún token ni toca `localStorage`), header `X-Logbook-CSRF: 1` en `POST/PATCH/PUT/DELETE`, tipado con `packages/shared`, manejo de `{ error }`, `401` → redirigir a `/login` con el aviso de sesión vencida ([[02_diseno]] §4.8), `403` → toast con `error.message`. TanStack Query para caché e invalidación (justificar en el commit; alternativa: `useEffect` a mano, descartada por el drag & drop optimista). | Tests (jsdom + msw): un `401` navega a `/login`; un `400` expone `error.message`; **toda petición `POST` lleva `X-Logbook-CSRF: 1` y ningún `GET` lo lleva** (interceptor de msw que lo comprueba); `grep -rn "localStorage\|sessionStorage" src/api` devuelve 0. |
| 3.3 ∥ | Componentes `ui/` de [[02_diseno]] §5: `Button` (3 variantes), `Input`, `Textarea`, `Select`, `Checkbox`, `Chip`, `Dialog` (foco atrapado, `Esc`), `Toast`, `Tooltip`, `Skeleton`. Cada uno con todos los estados. Página `/_kit` que los muestra. | Captura de `/_kit` a 1440 px; `Tab` recorre todos con foco visible; `Dialog` no deja salir el foco (test con Testing Library `userEvent.tab()`). |
| 3.4 | Layout (`AppShell`): sidebar 240 px colapsable (`[`), barra superior, área de contenido, `Outlet` de React Router. Rutas: `/login`, `/p/:slug`, `/p/:slug/:ref`, `/today`, `/week`, `/timeline` (placeholder), `/labels`, `/tokens`, `/settings`, `/_kit`. Guard: al cargar, `GET /me`; `401` → `/login` (no hay nada que leer en el navegador para saberlo). Página de login (RF-63, [[02_diseno]] §4.8, con el mensaje de 429 y el aviso de sesión vencida). | Login real contra la API de dev deja entrar y DevTools muestra la cookie `__Host-lb_session` con `HttpOnly`; sin sesión, cualquier ruta redirige a `/login`; `localStorage` no contiene ninguna clave relacionada con la sesión; sidebar lista los proyectos reales con su punto de color; `[` colapsa y se recuerda. Depende de 3.2 y 3.3. |
| 3.5 ∥ | Atajos globales (`useHotkeys` propio, sin librería si cabe en 60 líneas): `/`, `Ctrl+K`, `n`, `[`, `g d/w/t`, `?` con el diálogo de ayuda. No se disparan dentro de inputs. | Test: `n` en un input no abre nada; `?` abre la tabla de atajos. |

**Fase 3 lista cuando**: comandos estándar en verde; `/_kit` igual al diseño; login + navegación por sidebar funcionan contra la API de dev.

---

## Fase 4 — Frontend: kanban

| Tarea | Qué | Listo cuando |
|---|---|---|
| 4.1 | `CardTile` según [[02_diseno]] §4.1 (barra de estado, ID, chips, título 2 líneas, fecha con urgencia, `2/5`, punto de prioridad). | Storybook no; en `/_kit` se ven los 6 estados × urgencias. Test: fecha vencida tiene clase de danger y texto "vencida". |
| 4.2 | `Board` con 6 columnas (`minmax(10rem,1fr)`; con 220 px nunca cabían a 1440 px, ver [[02_diseno]] §4.1, decidido 2026-10-22), cabeceras con contador y WIP en ámbar (RF-13), columna Hecho con "últimos 14 días / ver todo" (RF-17), estados vacíos. Datos desde `GET /cards?project=`. | Un proyecto con 30 tarjetas se ve sin scroll horizontal a 1440 px; WIP 4/3 se pinta en ámbar. Depende de 4.1. |
| 4.3 | **Drag & drop** con `@dnd-kit/core` + `@dnd-kit/sortable` ([pregunta 4] cerrada): entre columnas y dentro de la columna, actualización optimista + `POST /move`, revertir si falla, anuncios `aria-live`, sensor de teclado (`Space`, flechas). Al soltar en Bloqueado → diálogo de motivo (RF-14); cancelar revierte. | Mover con ratón y con teclado persiste tras recargar; soltar en Bloqueado sin motivo no mueve; test de integración (msw) de la reversión al fallar la API. Depende de 4.2. |
| 4.4 ∥ | Tarjeta rápida (RF-26): `+` en cabecera, `Enter` crea y abre otro input, `Esc` cancela. Botón "Nueva tarjeta" (`n`) abre el panel de detalle en modo creación (título obligatorio, columna, prioridad, fechas, etiquetas; al crear pasa al detalle). El modo creación **no ofrece Bloqueado** como columna, igual que la tarjeta rápida: RF-14 exige motivo; se crea en Por hacer y se mueve (decidido 2026-10-26). | Crear tres seguidas con `Enter` deja tres tarjetas al final de la columna. Depende de 4.2. |
| 4.5 ∥ | Filtros del kanban (RF-18): etiqueta, prioridad, texto, en la barra superior; en la URL (`?label=&priority=&q=`). Navegación `j/k/h/l`, `Enter` abre, `m` abre "Mover a…". | Recargar con `?label=bug` mantiene el filtro; `m` + elegir columna mueve sin arrastrar. Depende de 4.2. |

**Fase 4 lista cuando**: comandos estándar en verde; puedo trabajar un día entero solo con el kanban (crear, mover, bloquear con motivo, filtrar) sin tocar la API a mano.

---

## Fase 5 — Frontend: detalle de tarjeta y bitácora

| Tarea | Qué | Listo cuando |
|---|---|---|
| 5.1 | Panel lateral `CardPanel` (480 px, superpuesto, `role="dialog"`, URL `/p/:slug/:ref`): cabecera con ID + copiar, chip de estado, título editable en línea (`e`, `Enter`), metadatos (proyecto, prioridad, fechas, etiquetas), rama sugerida con copiar, menú `⋯` (mover de proyecto, archivar). | Abrir con `Enter` desde el kanban y cerrar con `Esc` devuelve el foco a la tarjeta; editar fecha límite se refleja en el kanban sin recargar. |
| 5.2 ∥ | Pestaña **Bitácora**: lista cronológica, entradas de sistema atenuadas, toggle "Solo mis notas" (recordado), textarea al pie con `Ctrl+Enter`, "Otra fecha" con fecha y hora, editar/borrar notas propias y **borrar** (no editar) entradas de sistema (RF-32, decidido 2026-10-26); entrada de cierre opcional al pasar a Hecho (RF-34). | Escribir una nota aparece abajo sin recargar; el toggle oculta las `moved`; borrar pide confirmación (también una `moved`). Depende de 5.1. |
| 5.3 ∥ | Pestaña **Descripción**: markdown renderizado con `markdown-it` + `DOMPurify` (RS-12), editor textarea con vista previa. | Test: una descripción con `<script>` y `onclick` se renderiza sin ellos; enlaces llevan `rel="noopener noreferrer"`. Depende de 5.1. |
| 5.4 ∥ | Pestaña **Checklist**: ítems, marcar, editar en línea, reordenar (dnd-kit sortable), agregar al pie. | `2/5` del kanban cambia al marcar; reordenar persiste. Depende de 5.1. |
| 5.5 ∥ | Páginas **Etiquetas**, **Tokens** (token mostrado una vez con su fecha de vencimiento, columna "Vence" con chips ≤ 14 días / vencido / revocado y franja de aviso, revocar con confirmación; [[02_diseno]] §4.7), **Ajustes** (campos de settings + sección "Sesión" con "Salir" y "Cerrar todas las sesiones" con confirmación, RF-64; [[02_diseno]] §4.8). | Crear un token desde la UI y usarlo con `curl.exe` → `/me` 200; revocarlo → 401. Test (msw): un token con `expiresAt` a 10 días muestra el chip ámbar "vence en 10 días" y la franja; a 20 días no; uno vencido muestra "vencido". "Cerrar todas las sesiones" → confirmación → llama `POST /auth/logout-all` → `/login`; probado a mano con dos navegadores: el segundo da 401 en la siguiente acción. |

**Fase 5 lista cuando**: comandos estándar en verde; checklist de accesibilidad de [[02_diseno]] §6.3 completo (teclado, NVDA, zoom 200 %, grep de colores), incluidos los pendientes D-1 y D-9 de la revisión #2, que quedan abiertos hasta mi prueba manual (decidido 2026-10-26).

**🔒🎨 Revisión de Fable #2 (código + diseño)**: capturas del kanban, panel y kit a 1024 y 1440 px contra [[02_diseno]]; lectura del frontend buscando sanitización del markdown, manejo de `401`/`403`, que no exista ningún uso de `localStorage`/`sessionStorage` para autenticación, que el header CSRF vaya en todas las mutaciones y que el token de API mostrado una vez no quede en el estado de React ni en la URL. Sonnet corrige antes de la fase 6.

---

## Fase 6 — Mi día, Mi semana y búsqueda

| Tarea | Qué | Listo cuando |
|---|---|---|
| 6.1 ∥ | `/today` y `/week` según [[02_diseno]] §4.4 sobre `GET /log`: navegación de fechas, selector de proyecto, bloques por proyecto/tarjeta, sección "Se movieron", estados vacíos. | Una semana con notas en 3 proyectos se ve agrupada correctamente; `g d` / `g w` navegan. |
| 6.2 | Botón **"Copiar resumen"** (RF-43): pide `GET /summary?format=md` con los mismos filtros y lo copia al portapapeles (`navigator.clipboard`), toast "Copiado". | Pegar en el vault da el markdown exacto del formato de la spec. Depende de 6.1. |
| 6.3 ∥ | Paleta de búsqueda (`/`, `Ctrl+K`) según §4.6: debounce 200 ms, grupos Tarjetas/Bitácora, fragmentos resaltados, `↑↓ Enter`, `T-42` exacto primero. | Buscar `T-5` y `Enter` abre esa tarjeta; buscar un texto de una nota abre su tarjeta con la pestaña Bitácora. |

**Fase 6 lista cuando**: comandos estándar en verde; un viernes puedo generar el resumen de la semana y pegarlo en el vault en menos de 10 segundos; checklist de fin de fase 6 de [[02_diseno]] §6.3 completo (NVDA, teclado latinoamericano, zoom 200 %), incluido **D-4** de la revisión ([[../reviews/fase-6-resumen-busqueda]] §7: si "Buscando…" en cada tecla molesta con NVDA, sale de la región viva), que queda abierto hasta mi prueba manual (decidido 2026-10-27).

**🔒🎨 Revisión de Fable de la fase 6 (código + diseño)**: hecha el 2026-10-27 ([[../reviews/fase-6-resumen-busqueda]]), aprobada con cambios. Decisiones D-1..D-7 aprobadas ese día y pasadas a [[02_diseno]] §3, §4.4, §4.6, §6.1 y §6.3 y a RF-40, RF-42, RF-43 y RF-50; los ajustes de código (I-1..I-4, M-1..M-7, M-9, M-10) van en el commit de corrección de la rama. M-8 ("hoy" no cambia a medianoche con la pestaña abierta) puede esperar.

---

## Fase 7 — Skill de Claude Code

| Tarea | Qué | Listo cuando |
|---|---|---|
| 7.1 | Pasar el borrador de [[01_especificacion]] §7 a `docs/skill/SKILL.md`, ajustado a los endpoints finales (`docs/api.md` de 2.10) y al nombre definitivo, incluido el mensaje del `401` ("el token pudo haber vencido, duran 90 días"). Crear `C:\Users\fmira\.config\logbook\env` **fuera del repo** (lo hago yo, con un token de API real y el service token de Access cuando exista; en dev apunta a `http://localhost:3200/api/v1` sin headers de Access). | Desde una sesión de Claude Code contra la API de **dev**: "deja registro de que avancé en T-3" crea la entrada correcta; "qué tengo pendiente" lista bien; "bloquea T-3 porque…" mueve con motivo. |
| 7.2 | Copiar la skill a `C:\Users\fmira\.claude\skills\logbook\SKILL.md` y probar los tres flujos de §7 ("al terminar la sesión", "al empezar el día", "crear desde un plan"). Anotar en el vault (`05_learning/` o `00_inbox/`) lo que no funcionó bien. | Los tres flujos funcionan sin que yo tenga que corregir el curl a mano. Depende de 7.1. |

**Fase 7 lista cuando**: la skill está en el repo y en `~/.claude/skills/`; ninguna variable con secreto aparece en la transcripción de la sesión de prueba.

---

## Fase 8 — Docker y despliegue en Nexus

| Tarea | Qué | Listo cuando |
|---|---|---|
| 8.1 | `Dockerfile` multi-stage (RD-03): `node:22-alpine` + `corepack enable` → copiar manifiestos (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, los `package.json` de cada workspace) → `pnpm install --frozen-lockfile` → copiar el resto → `pnpm build` → etapa final con `pnpm deploy --prod` de `api` + `apps/web/dist` servido por Express (`express.static`, `immutable` para `/assets`, no-cache para `index.html`, fallback SPA). Usuario no root. `.dockerignore`. `CMD ["sh","-c","node dist/migrate.js && node dist/server.js"]`. | `docker build` termina; `docker run -p 127.0.0.1:3202:3000 --env-file .env.docker.local` sirve la UI y la API; `curl.exe -sI` muestra las cabeceras de RS-08; imagen < 250 MB. |
| 8.2 | `docker-compose.yml` de producción (RD-02): servicios `logbook` (redes `web` externa + `logbook_internal`, sin `ports`, healthcheck) y `db` (`postgres:18-alpine`, solo `logbook_internal`, volumen `/srv/data/logbook/postgres`, healthcheck, `POSTGRES_USER=logbook`, base `logbook`). `.env.example` completo (RD-05). | `docker compose config` válido; en el PC, `docker compose up` con un `.env` local levanta ambos, las migraciones corren y `/api/v1/health` da `db: true`. Depende de 8.1. |
| 8.3 | **Despliegue** (la hago yo con guía, RD-01, RD-06, RD-07): deploy key de solo lectura para `HikkizZ/LogBook` → `git clone` en `/srv/apps/logbook` → `.env` con `chmod 600` (hash de contraseña con el script, `POSTGRES_PASSWORD` aleatorio) → `mkdir -p /srv/data/logbook/postgres` → `docker compose up -d --build` → `logbook.conf` en `nexus-infra` (patrón con variable, sin barra final) → `nginx -t` + reload → commit en `nexus-infra` → ruta en el túnel → **Cloudflare Access**: app para `logbook.zytech.dev` (política correo + política Service Auth con un service token nuevo de **1 año**; anotar la fecha de vencimiento en `pendientes.md`) y app para `logbook.zytech.dev/api/v1/webhooks/github` con Bypass (puede esperar a v2). `.env` con `APP_ORIGIN=https://logbook.zytech.dev`. | `https://logbook.zytech.dev` pide login de Access y luego el de la app, y DevTools muestra la cookie `__Host-lb_session` con `Secure` y `HttpOnly`; crear una tarjeta desde la UI en producción funciona (confirma que `Origin` coincide con `APP_ORIGIN` detrás de Cloudflare y nginx); `curl.exe` con `CF-Access-Client-Id/Secret` + Bearer a `/me` → 200 desde el PC; sin los headers de Access → página de Access (no la app); `docker inspect` muestra `db` sin puertos publicados; en Cloudflare Access la cookie de la aplicación queda con **SameSite=Strict** (decisión D-1 de la revisión de seguridad de la fase 1); el hash de `ADMIN_PASSWORD_HASH` va entre comillas simples en el `.env` para que Compose no interpole los `$` (corregido tras la revisión #3; con comillas no hace falta `$$`). |
| 8.4 | Respaldo (RD-08): cron en el host con `pg_dump` comprimido a `/srv/data/logbook/backups/`, retención 14 días; probar un restore en el Postgres de pruebas de Nexus. | Un `.sql.gz` del día existe; el restore en una base vacía deja el mismo `count(*)` de `card`. Depende de 8.3. |
| 8.5 | Documentar (RD-10): `06_nexus_server/arquitectura.md` (tabla de apps), `setup_guia.md` (sección), `pendientes.md` (con dos recordatorios fechados: **renovar el service token de Access** al año y **crear un token de API nuevo** antes de los 90 días, además del respaldo); README del repo con despliegue y actualización; actualizar `env` de la skill a la URL real + headers de Access y repetir la prueba 7.2 contra producción. | La skill funciona contra producción desde el PC; el vault refleja el estado real y `pendientes.md` tiene las dos fechas. Depende de 8.3. |

**🔒 Revisión de Fable #3 (antes de 8.3)**: Dockerfile (usuario, secretos no horneados en la imagen: `docker history` sin `.env`), compose (sin `ports` en `db`, redes correctas), `.env.example` completo, `trust proxy` acotado, `pnpm audit`.

**Fase 8 lista cuando**: la app está en producción, uso real durante una semana, respaldo probado, vault actualizado. **Fin de v1.**

---

## Fase 9 — v1.5: línea de tiempo

| Tarea | Qué | Listo cuando |
|---|---|---|
| 9.1 ∥ | API `GET /timeline` (§4.10, RF-70): tarjetas activas con `barStart/barEnd/openEnded/urgency`. | Tests: una tarjeta sin `start_date` usa `created_at`; sin `due_date` → `openEnded: true`; vencida → `overdue`; 2 días → `soon`; Backlog/Hecho/archivadas no aparecen. |
| 9.2 ∥ | Vista `/timeline` según [[02_diseno]] §4.5: zoom semana/mes, grilla, línea de hoy, barras con color de proyecto, estados vencida/próxima/bloqueada, grupos plegables por proyecto, rango en URL, clic abre `CardPanel`. Sin arrastre de barras. | Capturas semana y mes a 1440 px; `g t` navega; una tarjeta vencida se ve roja; clic abre el panel y `Esc` vuelve. Depende de 9.1 solo para datos reales (se puede desarrollar con msw en paralelo). |
| 9.3 | Verificar RF-74 de punta a punta: mover a En curso completa `start_date` y la barra aparece sola. | Test de integración (msw) + prueba manual. |
| 9.4 | **`Ctrl+K` desde el panel de detalle** cierra el panel y abre la paleta de búsqueda (hoy `/` y `Ctrl+K` quedan inactivos con cualquier `aria-modal` abierto, [[02_diseno]] §4.6; apilar dos modales haría pelear sus trampas de foco, por eso se cierra uno antes de abrir el otro). Anotado en la revisión de la fase 6 (D-6, decidido 2026-10-27). | Con `T-12` abierta, `Ctrl+K` cierra el panel, abre la paleta con el foco en el campo y `Esc` devuelve el foco al botón "Buscar"; `/` sigue sin hacer nada en el panel (es texto en la nota). |

**Fase 9 lista cuando**: comandos estándar en verde; la vista me sirve para ver qué vence esta semana sin abrir el kanban.

---

## Fase 10 — v2: GitHub

| Tarea | Qué | Listo cuando |
|---|---|---|
| 10.1 | Migración: tabla `github_delivery`; índice único parcial de commits por tarjeta (§3.1). | Sube y baja limpia. |
| 10.2 | `POST /webhooks/github` (RS-06, RF-80..85): `express.raw` solo en esa ruta, verificación HMAC con `timingSafeEqual`, 401 sin cuerpo, 413 > 1 MB, dedupe por `X-GitHub-Delivery`, respuesta `202` inmediata, procesamiento en una cola en memoria (`setImmediate` o `p-queue`; justificar). Rate limit `60/min` por IP. | Tests con payloads reales de GitHub (fixtures recortadas y **anonimizadas**): firma válida → 202 y entrada creada; firma inválida → 401 sin body; mismo delivery dos veces → una sola entrada; push con `T-42` de otro proyecto → ignorado y `result = ignored_no_ref`. |
| 10.3 | Handlers: `push` → entrada `commit` por cada `T-n` del mensaje (regex `\bT-(\d+)\b`, varios por commit); `pull_request` → entrada `pr` + `move` a `review` ([pregunta 6] cerrada) al abrir, a `done` al mergear, solo entrada al cerrar sin merge. Reusa el servicio de `move` de 2.4 con `source: github`. | Tests por cada acción; un PR mergeado deja `completed_at` y una entrada `moved` con `source: github`. Depende de 10.2. |
| 10.4 ∥ | Pestaña **GitHub** en `CardPanel` (RF-84): commits y PRs desde las entradas `commit`/`pr`, con enlace; visible solo si el proyecto tiene repo. | Una tarjeta con 2 commits y 1 PR los lista con enlace que abre GitHub. |
| 10.5 | Configurar el webhook en el repo real (lo hago yo): URL `https://logbook.zytech.dev/api/v1/webhooks/github`, content type `application/json`, secret = `GITHUB_WEBHOOK_SECRET`, eventos `push` y `pull_request`; app de Access con Bypass para esa ruta (8.3). Probar con un commit `chore: prueba webhook (T-1)`. | La entrada aparece en T-1 en menos de 10 s; "Recent deliveries" en GitHub muestra 202; un reenvío manual no duplica. |
| 10.6 | **MCP opcional**: solo si tras dos semanas la skill con curl resulta engorrosa. Servidor MCP mínimo (`@modelcontextprotocol/sdk`, stdio) que expone `list_cards`, `get_card`, `add_log`, `move_card`, `create_card`, `summary` llamando a la misma API con los mismos headers. **Sin tocar el backend.** | Claude Code lista tarjetas vía MCP sin curl; la API no tiene commits en esta tarea. |

**Fase 10 lista cuando**: un commit con `T-n` en un repo vinculado aparece solo en la bitácora; un PR mergeado cierra la tarjeta; Fable revisa el handler del webhook (RS-06) antes de 10.5.

---

## v3 (sin plan todavía)

Se planifica solo si después de un mes de uso real sigo usando la app. Candidatos, por orden de valor para mí: exportar resumen semanal al vault (ya casi existe: `/summary` + la skill escribe el archivo), tiempo estimado vs real, dependencias entre tarjetas, prefijo de ID por proyecto ([pregunta 5]).

---

## Resumen de paralelismo

| Fase | Se pueden hacer a la vez |
|---|---|
| 0 | 0.2, 0.3, 0.4 |
| 1 | 1.4 + 1.5 + 1.6 (tras 1.3; son módulos puros que no tocan `app.ts`). 1.7, 1.8 y 1.9 van en serie: las tres editan `app.ts` o el router de `/auth` |
| 2 | 2.1 + 2.2; luego 2.5 + 2.6 + 2.8 + 2.9 (tras 2.3/2.4); 2.11 al final, sola (toca varios módulos) |
| 3 | 3.2 + 3.3; 3.5 con 3.4 |
| 4 | 4.4 + 4.5 (tras 4.2) |
| 5 | 5.2 + 5.3 + 5.4 + 5.5 (tras 5.1) |
| 6 | 6.1 + 6.3 |
| 9 | 9.1 + 9.2 |
| 10 | 10.4 con 10.2/10.3 |

Dos instancias de Sonnet en paralelo como máximo, en tareas que no compartan archivos; Opus integra y commitea.
