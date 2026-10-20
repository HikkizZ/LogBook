# Logbook — índice del proyecto

Herramienta **personal, de un solo usuario**, para ordenarme en mi trabajo de desarrollador: un kanban por proyecto, una **bitácora de avances** por tarjeta, vínculo con GitHub y una API REST que también usa Claude Code desde mis sesiones. Lo que la diferencia de Planka o Trello **no es el kanban**, es la bitácora y el vínculo con GitHub: quiero que al final del día o de la semana pueda responder "¿qué hice?" sin reconstruirlo de memoria, y que mis sesiones de Claude Code dejen registro solas.

**Nombre**: **Logbook**, en `logbook.zytech.dev` (decidido 2026-10-20). Repo `HikkizZ/LogBook`, local en `C:\Users\fmira\Projects\LogBook-Zytech`; esta especificación vive en `docs/spec/` del repo. En el código, contenedores, rutas y variables se usa `logbook` en minúsculas.

**Estado**: especificación escrita y preguntas 1–13 cerradas (2026-10-20). Sin código todavía. Se desplegará en mi servidor Nexus (`knowledge-vault/06_nexus_server/arquitectura.md`).

## Documentos

| Archivo | Qué es | Quién |
|---|---|---|
| [[01_especificacion]] | Alcance por versión, requisitos con ID, modelo de datos, contrato de la API, seguridad, despliegue y borrador de la skill para Claude Code | Fable (spec) |
| [[02_diseno]] | Tokens, tipografía, layout, vistas, estados de componentes, accesibilidad (contraste verificado) | Fable (diseño) |
| [[03_plan_implementacion]] | Reglas para quien programe y fases con tareas numeradas, "Listo cuando" y comandos de verificación | Fable → lo ejecuta Sonnet, lo coordina Opus |

## Reparto de roles

- **Opus**: planifica, coordina las fases, revisa cada cierre y **commitea** (nunca hace push sin mi confirmación).
- **Fable**: escribe las especificaciones y la documentación, y hace las **revisiones de seguridad y de código** en los puntos de control marcados en el plan (fin de fase 2, fin de fase 5, antes de desplegar). No programa.
- **Sonnet**: programa y escribe los tests, siguiendo los tres documentos.
- **Yo (Felipe)**: decido, cierro las preguntas abiertas y hago el despliegue en Nexus.

## Resumen de decisiones

Tomadas conmigo (están en el enunciado del proyecto):

- **Un solo usuario**. Sin multiusuario, sin roles, sin notificaciones, sin app móvil, sin comentarios, sin adjuntos pesados, sin Gantt completo, sin API de Claude de pago.
- **v1 = núcleo**: proyectos con tablero propio; kanban con columnas fijas (Backlog → Por hacer → En curso → Revisión → Bloqueado → Hecho), drag & drop, límite WIP visual en "En curso"; tarjeta con ID corto `T-42`, markdown, prioridad, etiquetas, fecha límite y checklist; bitácora por tarjeta (y motivo obligatorio al bloquear); vistas "Mi día" y "Mi semana" con "copiar resumen" en markdown; búsqueda; **API REST** (cookie de sesión para la UI, **Bearer token** para Claude Code); **skill de Claude Code con curl** (sin MCP, sin navegador, sin API de pago).
- **v1.5 = línea de tiempo** (no Gantt): barra por tarjeta activa de `fecha_inicio` a `fecha_limite`, agrupada por proyecto, línea de hoy, vencidas en rojo, ≤3 días en ámbar, zoom semana/mes.
- **v2 = integraciones**: webhook de GitHub (commit con `T-42` → entrada de bitácora; PR → mueve la tarjeta; PR mergeado → Hecho), nombre de rama sugerido, commits/PRs asociados visibles. MCP solo si la skill con curl se vuelve engorrosa, como capa delgada sobre la misma API.
- **v3 (solo si la uso de verdad)**: exportar resumen semanal o tarjeta cerrada como `.md` al vault; tiempo estimado vs real; dependencias entre tarjetas.
- **Stack**: React + Vite + TypeScript (frontend); Node.js + Express + TypeScript + TypeORM + PostgreSQL 18 (backend); **ESModules siempre**; Vitest + Supertest; Docker. **Monorepo pnpm workspaces** (`apps/api`, `apps/web`, `packages/shared`), una sola imagen Docker (Express sirve API + estático). Drag & drop con `@dnd-kit/core` + `@dnd-kit/sortable`.
- **Despliegue en Nexus** con mi patrón: app en `/srv/apps/<app>`, **contenedor de Postgres propio por app** en el compose (red interna, sin `ports`; no un Postgres instalado en el host), datos en `/srv/data/<app>/postgres`, entrada por `nginx-proxy` + Cloudflare Tunnel, `.env` con `chmod 600` y nunca en git. En el PC, **Postgres 18 en Docker** (`docker-compose.dev.yml`), no el Postgres 16 que tengo instalado (no tiene `uuidv7()`).
- **UI detrás de Cloudflare Access**. Claude Code entra desde el PC con **service token de Access (1 año, se renueva en Cloudflare) + Bearer de la app**. El webhook de GitHub pasa sin Access y se verifica con **HMAC (`X-Hub-Signature-256`)**.
- **Login de la UI con contraseña única** (hash argon2id en `.env`) que abre una **sesión en cookie `httpOnly`** (`__Host-lb_session`; `Secure`, `SameSite=Strict`, sin `Max-Age`), nunca un token en `localStorage`/`sessionStorage`. CSRF: `SameSite=Strict` + verificación de `Origin` + header `X-Logbook-CSRF: 1` en métodos que modifican. La API acepta cookie (UI) o Bearer (Claude Code); gestionar tokens y "cerrar todas las sesiones" solo con cookie.
- **Duraciones**: sesión de la UI vence a las **12 h sin uso** y a los **7 días desde el login** (las dos se validan en el servidor); logout invalida en el servidor; botón "Cerrar todas las sesiones" en Ajustes. **Tokens de API vencen a los 90 días** (`expires_at` obligatorio) y se renuevan creando uno nuevo; la pantalla Tokens avisa cuando faltan ≤ 14 días.
- **Diseño estilo Zendesk Garden**: sidebar verde petróleo, columnas sin color de fondo, estado como borde/punto en la tarjeta, Inter, radios 4–6 px, tokens como variables CSS en Tailwind v4 `@theme` para permitir modo oscuro después.

Tomadas por Fable al escribir la spec (cada una se puede revertir; están marcadas en los documentos):

- **Tokens de API y IDs de sesión hasheados con SHA-256** (no bcrypt): son aleatorios de 256 bits, no contraseñas; bcrypt no aporta y haría lenta cada petición. Los tokens de API llevan formato `lb_<id8>.<secreto>` para poder identificar el token sin descifrarlo; el ID de sesión no necesita prefijo (se busca por su hash).
- **Sesiones en una tabla `session` aparte**, no en `api_token` con `kind: session`: tienen dos vencimientos (inactividad y absoluto), no tienen nombre ni prefijo, y "cerrar todas las sesiones" es un `UPDATE` sobre una sola tabla sin tocar los tokens. `api_token` queda sin `kind`.
- **Si una petición trae `Authorization` y cookie a la vez, manda el Bearer** y la cookie se ignora; un Bearer inválido es 401, sin caer a la cookie. La UI nunca manda Bearer y curl nunca manda cookie, así que el caso es raro; lo que no quiero es que un token vencido "funcione" porque había una cookie al lado.
- **403 `FORBIDDEN`** (no 401) cuando la petición está autenticada pero no puede hacer eso: Bearer contra `/tokens` o `/auth/logout-all`, cookie sin header CSRF o con `Origin` ajeno.
- **Cada movimiento de tarjeta genera una entrada de bitácora de sistema** (`kind: moved`), además de las notas que escribo. Es lo que hace útil "Mi día": si solo moví tarjetas y no escribí nada, igual queda rastro. Se muestran atenuadas y se pueden ocultar.
- **Numeración `T-n` global** (una secuencia para todos los proyectos), no por proyecto. Un número único es lo que hace trivial reconocerlo en un mensaje de commit. Alternativa en pregunta 5.
- **Límite WIP solo visual**: la API nunca rechaza un movimiento por WIP. Si lo rechazara, Claude Code tendría que manejar un 409 para algo que es un aviso.
- **Borrar = archivar** (`archived_at`), tanto proyectos como tarjetas. El borrado físico no existe en la API v1.
- **API bajo `/api/v1`**: cuesta nada y la skill de Claude Code queda estable si algún día cambio el contrato.
- **Búsqueda con `tsvector` de PostgreSQL** (configuración `spanish`), sin motor externo. Es un solo usuario con pocos miles de filas como mucho.

## Preguntas abiertas

Cerradas todas el 2026-10-20. Dejo el texto original tachado para recordar qué alternativas descarté.

1. ~~**Nombre de la app y subdominio.**~~ **Cerrada (2026-10-20)**: Logbook, `logbook.zytech.dev`. Repo en GitHub: `HikkizZ/LogBook` (la carpeta local se llama `LogBook-Zytech`).
2. ~~**Monorepo o dos repos.** Recomiendo un repo con pnpm workspaces (`apps/api`, `apps/web`, `packages/shared` con los tipos y esquemas Zod compartidos). Un solo `git clone` en Nexus, un solo compose, los tipos de la API compartidos sin publicar nada. Dos repos solo tendría sentido si el frontend y el backend fueran a desplegarse por separado, y no es el caso.~~ **Cerrada (2026-10-20)**: monorepo pnpm workspaces (`apps/api`, `apps/web`, `packages/shared`); una sola imagen Docker, Express sirve API + estático.
3. ~~**pnpm o npm.** Recomiendo pnpm: ya lo uso en el portafolio, es más rápido y los workspaces son nativos. Fijado con `"packageManager"` en `package.json`.~~ **Cerrada (2026-10-20)**: pnpm.
4. ~~**Librería de drag & drop.** Recomiendo `@dnd-kit/core` + `@dnd-kit/sortable`: mantenida, accesible por teclado de fábrica (sensor de teclado), sin dependencia de React 18 legacy. Alternativa: `@hello-pangea/dnd` (fork de react-beautiful-dnd), más simple de montar pero menos flexible. Descarto HTML5 nativo: el orden dentro de columna y la accesibilidad se vuelven un trabajo propio.~~ **Cerrada (2026-10-20)**: `@dnd-kit/core` + `@dnd-kit/sortable`.
5. ~~**Prefijo de los IDs.** `T-42` global (como está en la spec) o prefijo por proyecto (`SIGA-12`, `PF-3`). Recomiendo mantener `T-n` global en v1: los mensajes de commit son inequívocos y el webhook no necesita saber a qué proyecto pertenece el repo para resolver el ID. El prefijo por proyecto queda como posible v3.~~ **Cerrada (2026-10-20)**: `T-n` global; prefijo por proyecto queda como candidato v3.
6. ~~**Columna "Revisión".** Para v2, cuando se abra un PR que mencione `T-42`, ¿moverla a "En curso" (como dice el enunciado) o a una sexta columna "Revisión"? Recomiendo agregar "Revisión" entre "En curso" y "Hecho" desde la v1 (aunque en v1 solo se use a mano): un PR abierto no es "en curso" ni "hecho", y agregar una columna después implica una migración y tocar el kanban.~~ **Cerrada (2026-10-20)**: columna "Revisión" (`review`) desde v1, entre "En curso" y "Bloqueado" en el tablero; en v2 un PR abierto la mueve ahí.
7. ~~**Cómo entra la UI a la API.** Recomiendo contraseña única → Bearer de sesión en `localStorage` (lo que está en la spec). Alternativa más segura ante XSS: cookie `httpOnly` + CSRF, pero deja dos mecanismos de auth (cookie para la UI, Bearer para Claude). Alternativa más cómoda: validar el JWT que Cloudflare Access inyecta (`Cf-Access-Jwt-Assertion`) y no tener login propio; la dejo para v2 si la contraseña molesta.~~ **Cerrada (2026-10-20), cambio de diseño**: decidí la alternativa más segura. Login con contraseña única (argon2id, hash en `.env`), pero la UI **no guarda ningún token en `localStorage`/`sessionStorage`**: el servidor responde con una **cookie de sesión** `__Host-lb_session` (`httpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, sin `Max-Age`) que contiene solo un ID aleatorio de alta entropía, guardado **hasheado** (SHA-256) en una tabla `session`; el ID se rota en cada login. **CSRF** con tres capas: `SameSite=Strict`, verificación de `Origin` (`https://logbook.zytech.dev` o el origen de dev) y un header obligatorio `X-Logbook-CSRF: 1` en POST/PATCH/PUT/DELETE cuando la petición se autentica por cookie. La API acepta dos mecanismos, cookie (UI) o `Authorization: Bearer` (Claude Code); si llegan los dos manda el Bearer. `/tokens` y "cerrar todas las sesiones" solo con cookie. Un XSS ya no se lleva la sesión; sigue pudiendo hacer peticiones mientras la pestaña esté abierta, y contra eso están la CSP estricta y la sanitización del markdown (RS-08, RS-12). Validar el JWT de Access en vez de tener login propio sigue como idea para v2.
8. ~~**Puertos de desarrollo.** Hay servicios en 3001, 3002, 3100 y 8080–8082. Recomiendo API en 3200, web en 3201, Postgres de desarrollo en `127.0.0.1:5433` (por si tengo un Postgres local en 5432).~~ **Cerrada (2026-10-20)**: API 3200, web 3201, Postgres dev `127.0.0.1:5433`, Postgres test `127.0.0.1:5434`.
9. ~~**Postgres de desarrollo en el PC.** Recomiendo un `docker-compose.dev.yml` con `postgres:18-alpine` (misma versión que en Nexus). Alternativa: usar el Postgres de pruebas de Nexus por túnel SSH, pero mezclaría datos de pruebas con la base de desarrollo.~~ **Cerrada (2026-10-20)**: Postgres 18 en Docker (`docker-compose.dev.yml`), **no** el Postgres 16 instalado en el PC (no tiene `uuidv7()` nativo). En el servidor, contenedor de Postgres propio por app, no un Postgres en el host: aislamiento, versión por app, respaldo y restore por app, sin exponer puertos en el host; los ~30–50 MB de RAM extra por contenedor no importan en el VPS-3.
10. ~~**Paleta de colores de proyecto.** Propongo 6 pares (suave + acento) en [[02_diseno]] §2.3, elegidos para no confundirse con los 4 colores de estado. Falta que los vea y apruebe.~~ **Cerrada (2026-10-20)**: paleta de [[02_diseno]] §2.3 aprobada tal cual.
11. ~~**Scopes en los tokens de API.** Recomiendo sin scopes en v1 (un token = acceso total a mi API, revocable). Si en v2 quiero un token de solo lectura para algo, se agrega una columna `scopes` sin romper nada.~~ **Cerrada (2026-10-20)**: sin scopes en v1.
12. ~~**Retención de la sesión de la UI.** Recomiendo 30 días de vida para el token de sesión, renovado en cada uso; los tokens de API no expiran (se revocan a mano).~~ **Cerrada (2026-10-20)**: más corto que lo que recomendé. **Sesión de la UI**: vence a las **12 h de inactividad** (deslizante, se renueva con cada petición) y a los **7 días desde el login** (absoluto, no se renueva); las dos se validan en el servidor, no en el navegador. Logout invalida la sesión en el servidor; en Ajustes hay un botón "Cerrar todas las sesiones". **Tokens de API**: vencen a los **90 días** (`expires_at` obligatorio) y se renuevan creando uno nuevo desde la pantalla Tokens, que muestra la fecha de vencimiento y avisa cuando faltan ≤ 14 días; la skill de Claude Code, ante un 401, dice que el token pudo haber vencido. Estas duraciones protegen la app y su contenido, no el VPS (el contenedor no tiene acceso al host, la BD no expone puertos y SSH va aparte). El **service token de Cloudflare Access dura 1 año** y se renueva en Cloudflare; va anotado en despliegue y en `pendientes.md`.
13. ~~**Versión de React.** Recomiendo la última estable que soporte `@dnd-kit` al momento de la fase 0 (verificar en ese momento; no cierro un número aquí).~~ **Cerrada (2026-10-20)**: la última React estable compatible con `@dnd-kit` al hacer la fase 0.

## Nota de uso — confidencialidad

Voy a registrar en mi VPS personal tareas de mi trabajo en SIGA. Regla para mí y para Claude Code: **las tarjetas y las entradas de bitácora se escriben en términos genéricos**. Sin nombres de clientes, sin datos de personas, sin credenciales, sin rutas internas ni nombres de servidores de SIGA, sin fragmentos de código propietario. "Migrar módulo de facturación: validar totales" sí; "cliente X reclama por factura 1234 del servidor Y" no. La skill de Claude Code repite esta regla.

## Relación con el resto del vault

- Servidor y despliegue: `knowledge-vault/06_nexus_server/arquitectura.md`, `knowledge-vault/06_nexus_server/pendientes.md` (ahí agrego la app cuando esté desplegada), conceptos en `knowledge-vault/06_nexus_server/infraestructura_web/infraestructura_web_index.md`.
- Referencia de formato de este tipo de proyectos: `knowledge-vault/04_projects/portfolio/00_portfolio.md`.
