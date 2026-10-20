# ADR 0001 — Autenticación: cookie `httpOnly` para la UI y Bearer para Claude Code

Estado: aceptada (2026-10-20, cierra la pregunta 7 y la 12 de [[../spec/00_logbook]]). Implementada en la fase 1 (`apps/api/src/auth/`).

## Contexto

Logbook tiene un solo usuario (yo) y dos clientes muy distintos de la misma API:

- La **UI** en el navegador, detrás de Cloudflare Access, en `logbook.zytech.dev`. Renderiza markdown que escribo yo y, en v2, texto que llega por webhook de GitHub: superficie de XSS que quiero asumir que algún día existe.
- **Claude Code** desde mi PC, con `curl` desde una skill. No tiene navegador, no guarda cookies, necesita una credencial que pueda poner en una variable de entorno y que dure semanas.

La primera versión de la spec proponía contraseña única → Bearer de sesión guardado en `localStorage`. Lo descarté al cerrar la pregunta 7: quería que un XSS no se llevara la sesión.

## Decisión

Dos mecanismos sobre el mismo middleware, con precedencia fija:

1. **Cookie de sesión** para la UI. `POST /auth/login` con la contraseña única (hash argon2id en `.env`, `ADMIN_PASSWORD_HASH`) abre una fila en la tabla `session` y responde `Set-Cookie: __Host-lb_session=<32 bytes aleatorios en base64url>; Path=/; Secure; HttpOnly; SameSite=Strict`, sin `Max-Age`. En la base va solo el SHA-256 del ID. El ID se rota en cada login (la sesión de la cookie entrante, si era válida, se revoca).
2. **Bearer** para Claude Code. `Authorization: Bearer lb_<id8>.<secreto>`, creado desde `/tokens` (solo con cookie), guardado como SHA-256 y buscado por prefijo; comparación con `timingSafeEqual`.

**Precedencia**: si la petición trae `Authorization`, se evalúa solo el Bearer; si falla, 401 sin mirar la cookie. Si no hay `Authorization`, se evalúa la cookie. La UI nunca manda Bearer y curl nunca manda cookie, así que el caso mixto solo aparece por error, y en ese caso no quiero que un token vencido "funcione" porque había una cookie al lado.

**CSRF**, tres capas que solo se exigen cuando la petición se autenticó por cookie (y en `/auth/login`): `SameSite=Strict`, `Origin` exactamente igual a `APP_ORIGIN`, y el header `X-Logbook-CSRF: 1` en `POST/PATCH/PUT/DELETE`. Sin CORS, un origen ajeno no puede mandar ese header sin un preflight que la API no responde. Fallo → 403.

**Duraciones**: la sesión vence a las **12 h sin uso** (`last_seen_at`, actualizado como mucho una vez por minuto) y a los **7 días desde el login** (`expires_at`, nunca se extiende); las dos las valida el servidor, el navegador no decide nada. Los tokens de API vencen a los **90 días** (`expires_at` obligatorio, fijado por el servidor) y se reemplazan creando otro. Logout revoca en el servidor; "Cerrar todas las sesiones" revoca todas las filas de `session`.

**Solo con cookie**: `/tokens` (crear, listar, revocar), `/auth/logout` y `/auth/logout-all`. Con Bearer responden 403. Un token filtrado de Claude Code no puede fabricar más tokens ni cerrar mis sesiones.

**Tabla `session` aparte** de `api_token` (ver alternativas).

## Alternativas descartadas

- **Bearer de sesión en `localStorage`** (lo que decía la primera spec). Un solo mecanismo y cero CSRF, pero cualquier XSS lee el token y lo exfiltra; con la cookie `httpOnly`, un XSS solo puede hacer peticiones mientras la pestaña está abierta, y contra eso están la CSP estricta (RS-08) y DOMPurify (RS-12). El costo son dos mecanismos y la verificación CSRF; me pareció barato.
- **Validar el JWT de Cloudflare Access** (`Cf-Access-Jwt-Assertion`) y no tener login propio. Es lo más cómodo (Access ya me autentica), pero ata la app a Cloudflare: sin Access delante (dev local, un cambio de proveedor, un túnel caído que me haga abrir el puerto un rato) la app quedaría sin autenticación. Prefiero que la app se defienda sola y que Access sea una capa más. Queda como idea para v2 si la contraseña molesta.
- **Una sola tabla para sesiones y tokens** (`api_token` con `kind: 'session'`). Se parecen solo en que guardan un hash. La sesión tiene dos vencimientos (inactividad y absoluto), no tiene nombre ni prefijo, no se lista en `/tokens`, y "cerrar todas las sesiones" es un `UPDATE session SET revoked_at = now()` sin riesgo de tocar un token. Con una tabla compartida, cada consulta filtraría por `kind` y la mitad de las columnas serían NULL según el tipo.
- **bcrypt/argon2 para los tokens y los IDs de sesión**. Son 256 bits aleatorios, no contraseñas: SHA-256 basta, y bcrypt haría lenta cada petición. argon2id se usa solo para la contraseña, que sí es de baja entropía.
- **Cookie "insegura" para desarrollo** (sin `Secure`/`__Host-`). Chrome y Firefox tratan `http://localhost` como contexto seguro y aceptan la cookie tal cual; no quiero un modo distinto para dev. Si un día uso Safari en dev, se revisa.

## Consecuencias

- La UI nunca guarda nada de autenticación en `localStorage`/`sessionStorage`; solo preferencias.
- Toda petición mutante desde la UI lleva `X-Logbook-CSRF: 1` (una línea en el cliente `fetch`); `APP_ORIGIN` tiene que ser exacto (`https://logbook.zytech.dev` en producción, `http://localhost:3201` en dev, sin barra final) o todo responde 403.
- Al llegar por un enlace externo, la navegación inicial no lleva la cookie (`SameSite=Strict`), pero `index.html` no la necesita y los `fetch` siguientes sí: la UI carga ya autenticada.
- Cada 90 días creo un token nuevo para Claude Code desde la pantalla Tokens y actualizo el `env` de la skill; la pantalla avisa cuando faltan ≤ 14 días y la skill, ante un 401, dice que el token pudo vencer.
- El rate limit del login (5 fallos / 15 min por IP) y el general (600 / 15 min por credencial) protegen la app, pero una cuota por IP también puede bloquearme a mí: ver [[../reviews/fase-1-seguridad]] (M-1, M-2, B-4) y la configuración de `TRUST_PROXY`.
- Estas duraciones protegen la app y su contenido, no el VPS: el contenedor no ve el host, la base no expone puertos y SSH va aparte. El service token de Access (1 año) se renueva en Cloudflare, no aquí.
