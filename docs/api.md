# Logbook — API v1

Referencia de la API tal como está implementada al cerrar la fase 2 (rama `fase-2-dominio`). La escribí leyendo los routers de `apps/api/src/` y los esquemas Zod de `packages/shared/src/schemas/`, no la spec: lo que diga distinto [[spec/01_especificacion]] §4 está anotado al final en "Diferencias con la spec". Si cambio un endpoint, cambio este archivo; la skill de Claude Code (`docs/skill/SKILL.md`, fase 7) se escribe a partir de aquí.

Base: `/api/v1`. Todo es JSON (`Content-Type: application/json; charset=utf-8`) salvo `GET /summary` con `format=md`, que responde `text/markdown`. Toda respuesta lleva `Cache-Control: no-store`.

## 1. Convenciones

### Autenticación

Salvo `GET /health` y `POST /auth/login`, todo exige **una** de estas credenciales:

| Mecanismo | Cómo | Quién | Vence |
|---|---|---|---|
| **Bearer** | `Authorization: Bearer lb_<8 chars>.<43 chars>` | Claude Code, scripts, `curl.exe` | 90 días desde que se creó en `/tokens` |
| **Cookie** | `__Host-lb_session=<id>` (la pone `POST /auth/login`) | la UI | 12 h sin uso o 7 días desde el login, lo primero |

Precedencia: si la petición trae `Authorization`, **solo** se evalúa el Bearer; si está mal, vencido o revocado es `401` aunque venga una cookie válida al lado (y esa cookie no se borra). Sin `Authorization`, se evalúa la cookie; si falla, `401` con `Set-Cookie` que la borra. Sin ninguna de las dos, `401`.

**CSRF** (solo con cookie): en `POST`, `PATCH`, `PUT` y `DELETE` hay que mandar `Origin: <APP_ORIGIN>` exacto y `X-Logbook-CSRF: 1`; si falta cualquiera, `403` antes de tocar nada. `POST /auth/login` también lo exige aunque todavía no haya cookie. Las peticiones con Bearer no pasan por esto.

**Solo con cookie**: `/tokens` (los tres métodos), `POST /auth/logout` y `POST /auth/logout-all`. Con Bearer responden `403`.

**Rate limit**: 600 peticiones / 15 min por credencial (por IP si no hay credencial) en todo lo que está detrás de la autenticación; `POST /auth/login` tiene 5 contraseñas incorrectas / 15 min por IP (los 400 y 403 no cuentan). Al pasarse, `429` con cabeceras `RateLimit-*`. `GET /health` no tiene límite.

### Formato de error

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "title: Too small: expected string to have >=1 characters", "details": [ { "path": "title", "message": "Too small: expected string to have >=1 characters" } ] } }
```

`details` solo viene en `VALIDATION_ERROR`; `path` es la ruta dentro del body/query/params (`labels`, `dueDate`, `cursor`) o vacío. Los mensajes de Zod vienen en inglés; los de reglas de negocio, en español.

| HTTP | `code` | Cuándo |
|---|---|---|
| 400 | `VALIDATION_ERROR` | body, query o params no pasan Zod; JSON mal formado; `reason` ausente al mover a `blocked`; etiqueta inexistente; editar una entrada de bitácora de sistema; `cursor` inválido |
| 401 | `UNAUTHORIZED` | sin credencial, Bearer inválido/vencido/revocado, cookie inválida/vencida/revocada, contraseña incorrecta |
| 403 | `FORBIDDEN` | cookie sin `Origin`/`X-Logbook-CSRF` en un método que modifica; Bearer contra `/tokens`, `/auth/logout`, `/auth/logout-all` |
| 404 | `NOT_FOUND` | `:ref`, `:slug` o `:id` inexistente; ruta desconocida bajo `/api/v1` (si estás autenticado; si no, 401) |
| 409 | `CONFLICT` | nombre de proyecto o etiqueta duplicado; archivar el único proyecto activo; crear o mover tarjetas hacia un proyecto archivado; mover una tarjeta archivada |
| 413 | `PAYLOAD_TOO_LARGE` | body > 256 KB |
| 429 | `RATE_LIMITED` | ver arriba |
| 500 | `INTERNAL` | nunca trae detalle; el detalle queda en el log del servidor |
| 503 | — | solo `GET /health` cuando la base no responde (`{ "ok": false, "db": false }`) |

### Tipos comunes

- **`:ref`** de tarjeta: `T-<n>` (`T-42`, también `T-042`) o el uuid. `T-0`, un número que no cabe en `integer` o un uuid que no existe → `404`.
- **`:slug`** de proyecto: `^[a-z0-9]+(-[a-z0-9]+)*$`, máx. 80. Lo genera la API del nombre al crear y no cambia.
- **`:id`** de etiqueta, ítem de checklist o entrada: uuid (`400` si no tiene forma de uuid).
- **Fechas** (`date`): `YYYY-MM-DD` con día válido para el mes (`2026-02-30` es 400). **Instantes** (`timestamptz`): ISO 8601; en respuestas siempre en UTC con `Z` (`2026-10-21T14:03:00.000Z`); en `occurredAt` de entrada hay que mandar zona (`Z` o `-03:00`), sin zona es 400.
- **Listas en query**: `status=in_progress,blocked`, `kinds=note,blocked` (separadas por coma, sin espacios obligatorios).
- **Booleanos en query**: exactamente `true` o `false` (`1`/`0` es 400).
- Los `z.object` normales ignoran claves desconocidas; los `PATCH` (`strictObject`) responden 400 ante una clave desconocida (así `status` en `PATCH /cards/:ref` o `slug` en `PATCH /projects/:slug` son 400).

### Ejemplos con `curl.exe`

Todos los ejemplos de abajo asumen esto al inicio del comando (en Git Bash; `set -a` exporta lo que carga `source`):

```bash
set -a; source "/c/Users/fmira/.config/logbook/env"; set +a
lb() { curl.exe -sS --fail-with-body -H "Authorization: Bearer $LOGBOOK_TOKEN" \
  -H "Content-Type: application/json" "$@"; }
```

En dev `LOGBOOK_URL=http://localhost:3200/api/v1`; en producción `https://logbook.zytech.dev/api/v1` y además los dos headers `CF-Access-Client-Id` / `CF-Access-Client-Secret` del service token de Access.

## 2. Autenticación y sesión

### `POST /auth/login`

Sin credencial, con CSRF (`Origin` + `X-Logbook-CSRF: 1`). Body `{ "password": string (1..1024) }`.

- `204` + `Set-Cookie: __Host-lb_session=<43 chars>; Path=/; Secure; HttpOnly; SameSite=Strict` (sin `Max-Age`). Si venía una cookie válida, esa sesión se revoca y se emite otra.
- `401 UNAUTHORIZED` "Contraseña incorrecta", sin cookie. `403` sin CSRF. `429` al sexto fallo en 15 min.

### `POST /auth/logout` · `POST /auth/logout-all`

Solo cookie (+ CSRF). `204` + `Set-Cookie` con `Max-Age=0`. `logout` revoca la sesión actual; `logout-all` revoca todas. Con Bearer, `403`.

### `GET /me`

Cookie o Bearer. Sirve para comprobar que la credencial vale.

```json
{ "auth": "token", "name": "Claude Code PC", "prefix": "lb_AbCdEfGh", "expiresAt": "2027-01-19T12:00:00.000Z" }
{ "auth": "session", "expiresAt": "2026-10-28T12:00:00.000Z", "idleExpiresAt": "2026-10-22T00:00:00.000Z" }
```

```bash
lb "$LOGBOOK_URL/me"
```

## 3. Tokens de API — solo cookie

| Método y ruta | Body | Respuesta |
|---|---|---|
| `GET /tokens` | | `200 [{ id, name, prefix, lastUsedAt, createdAt, expiresAt, revokedAt }]`, más recientes primero. `prefix` son los 8 caracteres sin `lb_`. Nunca el hash ni el token. |
| `POST /tokens` | `{ "name": string (1..80, se recorta) }` | `201 { id, name, prefix, token, expiresAt }`. `token` solo aquí, una vez; `expiresAt` = ahora + 90 días. |
| `DELETE /tokens/:id` | | `204`. Revoca (la fila queda). `404` si no existe. |

Con Bearer los tres responden `403 FORBIDDEN`.

## 4. Proyectos

Objeto `Project`:

```json
{ "id": "0199...", "name": "SIGA", "slug": "siga", "color": "violeta", "githubRepo": "owner/repo", "wipLimit": 3,
  "archivedAt": null, "createdAt": "2026-10-21T14:00:00.000Z", "updatedAt": "2026-10-21T14:00:00.000Z" }
```

Colores válidos (`color`): `violeta`, `magenta`, `cafe`, `pizarra`, `turquesa`, `oliva`.

| Método y ruta | Query / body | Respuesta |
|---|---|---|
| `GET /projects` | `?archived=true` incluye los archivados (default: solo activos) | `200 [Project + { cardCounts: { backlog, todo, in_progress, review, blocked, done } }]` por `createdAt` ascendente. `cardCounts` cuenta solo tarjetas **no archivadas**. |
| `POST /projects` | `{ name (1..80), color, githubRepo? (`^[\w.-]+/[\w.-]+$`, ≤ 140, o null), wipLimit? (0..32767) }` | `201 Project`. El `slug` sale del nombre (`"Diseño API v2"` → `diseno-api-v2`); si ya existe (incluso archivado) se añade `-2`, `-3`… Nombre vacío tras recortar → 400; nombre sin letras ni dígitos → slug `proyecto`. `409` si hay un proyecto **activo** con ese nombre. |
| `GET /projects/:slug` | | `200 Project` (también si está archivado). |
| `PATCH /projects/:slug` | `{ name?, color?, githubRepo? (o null), wipLimit? }` estricto | `200 Project`. `slug` o cualquier otra clave → 400. `409` nombre duplicado entre activos. |
| `POST /projects/:slug/archive` | | `200 Project`. Idempotente. `409` si es el único activo. |
| `POST /projects/:slug/unarchive` | | `200 Project`. Idempotente. `409` si ya hay uno activo con el mismo nombre. |

```bash
lb "$LOGBOOK_URL/projects"
lb -X POST "$LOGBOOK_URL/projects" -d '{"name":"SIGA","color":"violeta","githubRepo":"owner/repo","wipLimit":3}'
lb -X PATCH "$LOGBOOK_URL/projects/siga" -d '{"wipLimit":4}'
lb -X POST "$LOGBOOK_URL/projects/siga/archive"
```

## 5. Etiquetas

Objeto `Label`: `{ id, name, color, createdAt }`. Colores: los de proyecto más `gris`. Son globales (no por proyecto) y únicas sin distinguir mayúsculas (`Bug` = `bug`).

| Método y ruta | Body | Respuesta |
|---|---|---|
| `GET /labels` | | `200 [Label]` por `createdAt`. |
| `POST /labels` | `{ name (1..40, se recorta), color }` | `201 Label`. `409` si existe (case-insensitive). |
| `PATCH /labels/:id` | `{ name?, color? }` estricto | `200 Label`. `409` duplicado. |
| `DELETE /labels/:id` | | `204`. Quita la etiqueta de todas las tarjetas. `404` si no existe. |

```bash
lb -X POST "$LOGBOOK_URL/labels" -d '{"name":"infra","color":"gris"}'
```

## 6. Tarjetas

Objeto `Card`:

```json
{ "id": "0199...", "ref": "T-42", "number": 42, "project": "siga", "title": "Migrar facturas",
  "description": "markdown crudo", "status": "in_progress", "priority": "high",
  "labels": [ { "name": "feature", "color": "violeta" } ], "position": 0,
  "startDate": "2026-10-21", "dueDate": "2026-10-24", "completedAt": null, "archivedAt": null,
  "checklistDone": 2, "checklistTotal": 5, "createdAt": "...", "updatedAt": "..." }
```

Estados: `backlog`, `todo`, `in_progress`, `review`, `blocked`, `done`. Prioridades: `low`, `medium`, `high`, `urgent`. `labels` viene ordenado por nombre. `position` es el índice `0..n-1` dentro de la columna (proyecto + estado), solo entre tarjetas no archivadas; la API renumera la columna completa en cada cambio.

### `GET /cards`

| Query | Tipo | Notas |
|---|---|---|
| `project` | slug | `404` si no existe. Sin él, todas las tarjetas de todos los proyectos (archivados incluidos). |
| `status` | lista de estados | `status=in_progress,blocked` |
| `label` | nombre de etiqueta | sin distinguir mayúsculas; una etiqueta inexistente simplemente no casa nada |
| `priority` | prioridad | |
| `due_before` | date | **estricto**: `due_date < fecha`. Tarjetas sin fecha no casan. |
| `archived` | `true`/`false` | default `false` = solo activas; `true` = activas **y** archivadas |
| `limit` | 1..200 | default 100 |
| `cursor` | string | el `nextCursor` de la página anterior; manipulado → 400 |

`200 { items: [Card], nextCursor: string | null }`, ordenadas por `(status, position, number)` (el orden de los estados es el de las columnas). El cursor es opaco (base64url de `{ s, p, n }`), no guarda los filtros: hay que repetirlos en cada página.

```bash
lb "$LOGBOOK_URL/cards?project=siga&status=in_progress,blocked"
lb "$LOGBOOK_URL/cards?label=bug&priority=urgent&due_before=2026-10-31&limit=50"
```

### `POST /cards`

Body:

| Campo | Tipo | Notas |
|---|---|---|
| `project` | slug | obligatorio; `404` si no existe, `409` si está archivado |
| `title` | string 1..200 | se recorta; obligatorio |
| `description` | string ≤ 20 000 | markdown crudo; default `""` |
| `status` | estado | default `backlog`. Va al **final** de esa columna. Si es `in_progress`, se completa `startDate` con hoy (salvo que `dueDate` ya pasó); si es `done`, `completedAt` = ahora. `blocked` al crear **no** exige motivo ni crea entrada. |
| `priority` | prioridad | default `medium` |
| `labels` | `[nombre]` ≤ 20 | sin distinguir mayúsculas; un nombre inexistente → `400` (`path: "labels"`); no se crea sola |
| `dueDate`, `startDate` | date o null | `dueDate >= startDate` si vienen ambas, si no `400` |
| `checklist` | `[texto 1..300]` ≤ 100 | ítems en ese orden, sin hacer |

`201 Card`.

```bash
lb -X POST "$LOGBOOK_URL/cards" -d '{"project":"siga","title":"Migrar facturas","priority":"high","labels":["feature"],"dueDate":"2026-10-24","checklist":["Exportar","Validar totales"]}'
```

### `GET /cards/:ref`

`200 CardDetail` = `Card` + `checklist: [Item]` (por posición) + `log: [LogEntry]` (las **últimas 50** por `occurredAt`, devueltas en orden cronológico) + `branchName` (`feat/T-42-migrar-facturas`, o `fix/...` si tiene la etiqueta `bug`; slug del título ≤ 50 caracteres). Las archivadas también resuelven.

```bash
lb "$LOGBOOK_URL/cards/T-42"
```

### `PATCH /cards/:ref`

Body estricto `{ title?, description?, priority?, labels?, dueDate? (o null), startDate? (o null), project? }`. **`status` → 400**: para eso está `move`. `labels` reemplaza el conjunto completo. `project` mueve la tarjeta a otro proyecto (misma columna, al final; conserva `ref`, bitácora y checklist); `409` si el destino está archivado. Se verifica `dueDate >= startDate` con los valores resultantes. Una tarjeta archivada se puede editar.

`200 Card`.

```bash
lb -X PATCH "$LOGBOOK_URL/cards/T-42" -d '{"dueDate":"2026-10-30","labels":["feature","docs"]}'
```

### `POST /cards/:ref/move`

Body `{ status, position?, reason? }`:

- `status`: destino. `position`: índice 0-based en la columna destino; omitida o mayor que el tamaño = al final; entero ≥ 0, sin tope (se acota).
- `reason` (3..5000, se recorta): **obligatorio al pasar a `blocked` desde otro estado** (`400` con `path: "reason"`); si viene en cualquier otro movimiento, se ignora. Reordenar dentro de `blocked` no lo pide.

Efectos en una transacción: renumera origen y destino; al entrar a `in_progress` completa `startDate` con hoy si estaba vacía (y si `dueDate` no está ya en el pasado, porque la base exige `dueDate >= startDate`); al entrar a `done` pone `completedAt` = ahora; al salir de `done` lo vacía; crea una entrada `moved` (`body` "Por hacer → En curso", `metadata { from, to }`) y, si va a `blocked`, otra `blocked` con el motivo. `source` = `ui` con cookie, `api` con Bearer. Misma columna con otra `position`: solo reordena, sin entradas. El WIP nunca bloquea.

`200 Card`. `409` si la tarjeta está archivada.

```bash
lb -X POST "$LOGBOOK_URL/cards/T-42/move" -d '{"status":"in_progress"}'
lb -X POST "$LOGBOOK_URL/cards/T-42/move" -d '{"status":"blocked","reason":"Espero respuesta sobre el formato"}'
lb -X POST "$LOGBOOK_URL/cards/T-42/move" -d '{"status":"todo","position":0}'
```

### `POST /cards/:ref/archive` · `POST /cards/:ref/unarchive`

`200 Card`. Idempotentes. Archivar saca la tarjeta de la columna (y la compacta); desarchivar la devuelve al final de su columna. Archivada: no aparece en `GET /cards` sin `archived=true`, sí en búsqueda y en `GET /log`; se le pueden seguir agregando notas y checklist.

## 7. Checklist

Objeto `Item`: `{ id, text, done, position }`.

| Método y ruta | Body | Respuesta |
|---|---|---|
| `POST /cards/:ref/checklist` | `{ text (1..300) }` | `201 Item` al final |
| `PATCH /checklist/:id` | `{ text?, done?, position? }` estricto | `200 Item`. `position` = índice destino (0-based), acotado al rango; el resto se renumera |
| `DELETE /checklist/:id` | | `204`; renumera |

```bash
lb -X POST "$LOGBOOK_URL/cards/T-42/checklist" -d '{"text":"Validar totales"}'
lb -X PATCH "$LOGBOOK_URL/checklist/0199…" -d '{"done":true}'
```

## 8. Bitácora

Objeto `LogEntry`:

```json
{ "id": "0199...", "cardRef": "T-42", "kind": "note", "source": "api", "body": "Avancé X. Quedó Y.",
  "occurredAt": "2026-10-21T18:30:00.000Z", "metadata": {}, "createdAt": "2026-10-21T18:30:05.000Z" }
```

`kind`: `note`, `blocked`, `moved`, `commit`, `pr`. `source`: `ui`, `api`, `github`. `metadata` de `moved`: `{ "from": "todo", "to": "in_progress" }`.

| Método y ruta | Query / body | Respuesta |
|---|---|---|
| `GET /cards/:ref/log` | `?kinds=note,blocked&limit=` (1..500, default **100**) | `200 [LogEntry]`: las últimas `limit` entradas, en orden cronológico |
| `POST /cards/:ref/log` | `{ body (1..5000), occurredAt? (ISO con zona; default ahora), kind?: "note" \| "blocked" (default `note`) }` | `201 LogEntry`; `source` según credencial |
| `PATCH /log/:id` | `{ body?, occurredAt? }` estricto | `200 LogEntry`. Solo `note` y `blocked`; una de sistema → `400` (`path: "kind"`) |
| `DELETE /log/:id` | | `204`. Cualquier kind, también las de sistema |

```bash
lb -X POST "$LOGBOOK_URL/cards/T-42/log" -d '{"body":"Avancé la exportación. Quedó pendiente validar totales."}'
lb -X POST "$LOGBOOK_URL/cards/T-42/log" -d '{"body":"Reunión de ayer","occurredAt":"2026-10-20T16:00:00-03:00"}'
lb "$LOGBOOK_URL/cards/T-42/log?kinds=note,blocked&limit=20"
```

### `GET /log` — bitácora agregada

Query: `from`, `to` (date), `project` (slug, `404` si no existe), `kinds` (lista). Sin `from` ni `to` = **hoy**; con uno solo = ese día; `from <= to` y como mucho 366 días (`400` si no). Los días son de `APP_TIMEZONE` (`America/Santiago`): una entrada de las 23:30 de Santiago cae en ese día aunque en UTC sea el siguiente.

```json
{ "days": [ { "date": "2026-10-21", "projects": [ { "project": Project, "cards": [ { "card": Card, "entries": [LogEntry] } ] } ] } ],
  "moved": [Card] }
```

Días ascendentes; proyectos por nombre; tarjetas en el orden de su primera entrada del día; entradas cronológicas. `moved` = tarjetas con alguna entrada `moved` en el período (ignora `kinds`), la movida más recientemente al final. Sin entradas: `days: []`.

```bash
lb "$LOGBOOK_URL/log"
lb "$LOGBOOK_URL/log?from=2026-10-19&to=2026-10-25&project=siga&kinds=note,blocked"
```

### `GET /summary` — resumen en markdown

Mismos filtros que `/log` más `format=md` (default) | `json`. Con `json` devuelve exactamente la estructura de `/log`. Con `md`, `200 text/markdown; charset=utf-8`:

```markdown
## Semana 43 — 2026-10-19 a 2026-10-25

### SIGA

- **T-42** Migrar facturas — avancé X, quedó Y (mar 21); Bloqueado: espero respuesta (mié 22); Por hacer → En curso → Bloqueado (mié 22)
```

Una línea por tarjeta: las entradas escritas en orden (`blocked` con prefijo `Bloqueado: `), cada una con su día, y al final el recorrido de columnas de las `moved` con el día del último movimiento. Un solo día se titula `## Día 2026-10-21`; sin actividad, `_Sin actividad en el período._`. Títulos y cuerpos van tal cual, con los saltos de línea colapsados a un espacio (ver la nota de seguridad en la revisión de la fase 2 sobre markdown dentro de títulos).

```bash
lb "$LOGBOOK_URL/summary"
lb "$LOGBOOK_URL/summary?from=2026-10-19&to=2026-10-25"
```

## 9. Búsqueda

### `GET /search?q=<texto>&limit=20`

`q` 3..200 caracteres (se recorta; menos de 3 → `400`); `limit` 1..100.

```json
{ "cards": [ { "card": Card, "snippet": "… migración de <mark>facturas</mark> …" } ],
  "entries": [ { "entry": LogEntry, "card": Card, "snippet": "…" } ] }
```

- Tarjetas: `tsvector` `spanish` sobre título + descripción (`plainto_tsquery`, los operadores `& | !` son texto) o, de respaldo, subcadena sin distinguir mayúsculas ni tildes. Primero las de texto completo por relevancia, luego las del respaldo por `updatedAt`. Entradas: lo mismo sobre `body`, por `occurredAt`.
- Si `q` es exactamente `T-<n>` y esa tarjeta existe, va en `cards[0]` (con el inicio de su texto como `snippet`, sin resaltar) y ocupa uno de los `limit` lugares.
- Archivadas incluidas (se distinguen por `archivedAt`).
- `snippet` es **texto plano con `&`, `<` y `>` escapados como entidades**, donde el único HTML son las marcas `<mark>…</mark>`. La UI puede inyectarlo como HTML solo permitiendo `<mark>` (DOMPurify `ALLOWED_TAGS: ['mark']`).

```bash
lb "$LOGBOOK_URL/search?q=migracion+facturas"
lb "$LOGBOOK_URL/search?q=T-42"
```

## 10. Ajustes y salud

### `GET /settings` · `PATCH /settings`

`{ "timezone": "America/Santiago", "doneDaysVisible": 14, "wipDefault": 3 }`. `PATCH` acepta cualquier subconjunto (estricto, al menos una clave): `timezone` debe ser una zona IANA válida; `doneDaysVisible` 1..365; `wipDefault` 0..32767. Devuelve el objeto completo. Hoy `timezone` y `wipDefault` se guardan pero no se usan: los días de `/log` salen de `APP_TIMEZONE` y el WIP por defecto es el `DEFAULT 3` de la tabla (`TODO(spec)` en el código).

### `GET /health`

Sin credencial ni límite. `200 { "ok": true, "db": true }`; `503 { "ok": false, "db": false }` si `SELECT 1` no responde en 2 s.

## 11. Diferencias con la spec (§4)

Lo que el código hace distinto de [[spec/01_especificacion]] §4 o que la spec no fija. No lo corregí: son decisiones mías pendientes (las que llevan `TODO(spec)` en el código están marcadas con ⚑).

| # | Dónde | Spec | Código |
|---|---|---|---|
| 1 | `GET /health` | solo `200 { ok, db }` | `503 { ok: false, db: false }` si la base no contesta (lo pide el plan 2.9) |
| 2 | `GET /projects` `cardCounts` | no dice | cuenta solo tarjetas **no archivadas** |
| 3 | `PATCH /projects/:slug` | "cualquier campo salvo `slug`" | estricto: `slug` u otra clave desconocida → 400 (en vez de ignorarla) |
| 4 | `wipLimit`, `wipDefault` | sin rango | 0..32767 (smallint) |
| 5 | `GET /cards?archived` | `archived=false` (default) | ⚑ `archived=true` incluye archivadas **junto a** las activas, no solo archivadas |
| 6 | `GET /cards?due_before` | no dice si inclusivo | ⚑ estricto (`due_date < fecha`) |
| 7 | `GET /cards?limit` | `limit=100` | default 100, máximo 200; `cursor` máximo 200 caracteres |
| 8 | `POST /cards` con etiqueta inexistente | no dice | ⚑ `400`, no se crea sola |
| 9 | `POST /cards` / `PATCH project` hacia proyecto archivado | no dice | ⚑ `409 CONFLICT` |
| 10 | `POST /cards` con `status: in_progress` / `done` | RF-15 habla de **mover** | ⚑ aplica RF-15 también al crear (`startDate` / `completedAt`) |
| 11 | `POST /cards` con `status: blocked` | RF-14 exige motivo al **mover** | no exige `reason` ni crea entrada `blocked` al crear |
| 12 | `POST /cards/:ref/move` sobre archivada | no dice | ⚑ `409` |
| 13 | `move` a `in_progress` con `dueDate` pasada | RF-15: completa `start_date` con hoy | ⚑ no la completa (rompería `due_date >= start_date`) |
| 14 | `move` con `reason` | solo se menciona al bloquear | `reason` 3..5000; en otros movimientos se acepta y se ignora; reordenar dentro de `blocked` no lo pide |
| 15 | `labels` por tarjeta, `checklist` al crear | sin tope | ≤ 20 etiquetas, ≤ 100 ítems |
| 16 | `GET /cards/:ref/log` | `?kinds&limit=` sin default | default 100, máximo 500 |
| 17 | `POST /cards/:ref/log` `occurredAt` | ISO 8601 | exige zona (`Z` o `±hh:mm`); sin zona → 400 |
| 18 | `GET /log` / `/summary` rango | "default: hoy" | además: un solo límite = ese día; `from <= to`; máximo 366 días (`LOG_RANGE_MAX_DAYS`) |
| 19 | `GET /log` orden interno | no dice | ⚑ proyectos por nombre, tarjetas por primera entrada del día |
| 20 | `GET /summary` formato | solo el ejemplo de una semana | ⚑ `## Día <fecha>` para un día; `_Sin actividad en el período._`; `Bloqueado: ` como prefijo; recorrido de columnas al final de la línea |
| 21 | `GET /search` | `q` < 3 → 400 | además `q` ≤ 200 y `limit` 1..100 (default 20); define el formato de `snippet` (texto escapado + `<mark>`) |
| 22 | `GET /settings` | `{ timezone, doneDaysVisible, wipDefault }` | ⚑ rangos 1..365 y 0..32767; `timezone` y `wipDefault` se guardan pero no se usan |
| 23 | `/tokens` `prefix` | `lb_XXXXXXXX` | `GET`/`POST /tokens` devuelven los 8 caracteres sin `lb_`; `GET /me` sí lo devuelve con `lb_` |
| 24 | Rutas desconocidas | `404 NOT_FOUND` | 404 JSON solo autenticado; sin credencial, 401 (no revela qué rutas existen) |
| 25 | Archivadas y escritura | RF-27 solo habla de dónde se muestran | se puede editar (`PATCH`), anotar (`POST log`) y agregar checklist a una tarjeta archivada; moverla no |
| 26 | Tarjetas de un proyecto archivado | RF-04 solo habla de la sidebar y el kanban | se pueden mover y editar; solo crear y traer tarjetas al proyecto está cerrado (409) |
