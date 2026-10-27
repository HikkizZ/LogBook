# Logbook

App personal de kanban y bitácora. Monorepo pnpm:

- `apps/api`: API Express 5 + TypeScript + TypeORM (puerto 3200)
- `apps/web`: React + Vite + Tailwind v4 (puerto 3201, proxy de `/api` a la API)
- `packages/shared`: tipos y esquemas Zod compartidos

La especificación está en `docs/spec/`.

## Requisitos

Node 22, pnpm 11 y Docker.

## Desarrollo

```
pnpm install
pnpm db:up     # Postgres 18 en Docker: dev en 127.0.0.1:5435, test en 127.0.0.1:5436
pnpm dev       # API en http://localhost:3200 y web en http://localhost:3201
```

Comprobar: `curl http://localhost:3201/api/v1/health` responde `{"ok":true,"db":false}`.

Para variables de entorno copia `.env.example` a `.env` (ignorado por git). Los tests usan `.env.test`.
Usa siempre el Postgres de Docker, no uno instalado en el PC (se necesita `uuidv7()` de Postgres 18).

## Autenticación en desarrollo

La API acepta dos credenciales: la **cookie de sesión** que abre el login de la UI y un **Bearer token** para Claude Code (por qué así: `docs/adr/0001-autenticacion-cookie-y-bearer.md`).

El `.env` local necesita, como mínimo:

| Variable              | Valor en desarrollo                                               |
| --------------------- | ----------------------------------------------------------------- |
| `DATABASE_URL`        | la URL de `db-dev` (`127.0.0.1:5435`, usuario y base `logbook`)   |
| `APP_ORIGIN`          | `http://localhost:3201` exacto, sin barra final (chequeo de CSRF) |
| `ADMIN_PASSWORD_HASH` | hash argon2id de la contraseña de la UI, generado como sigue      |
| `PORT`                | `3200` (opcional, es el valor por defecto)                        |
| `TRUST_PROXY`         | vacío en desarrollo; en el servidor, la subred Docker del proxy   |

Generar el hash de la contraseña (pide la contraseña sin eco; usa PowerShell o Windows Terminal, en Git Bash puede no detectar la TTY):

```
pnpm --filter api hash-password
```

Copia la línea que imprime al `.env` **entre comillas simples**, porque contiene `$`:

```
ADMIN_PASSWORD_HASH='$argon2id$v=19$m=...'
```

Nunca se guarda la contraseña en claro ni el hash en el repo. Después, `pnpm --filter api migration:run` y `pnpm dev`.

Crear un token para Claude Code (solo con la cookie de sesión; con Bearer responde 403). Desde la UI, en Ajustes → Tokens (fase 3); hasta entonces, desde la consola del navegador en `http://localhost:3201`:

```js
await fetch('/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Logbook-CSRF': '1' },
  body: JSON.stringify({ password: '…' }),
});
const r = await fetch('/api/v1/tokens', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Logbook-CSRF': '1' },
  body: JSON.stringify({ name: 'Claude Code PC' }),
});
console.log(await r.json()); // el campo `token` se muestra solo esta vez
```

El token vence a los 90 días y se reemplaza creando otro. Probarlo:

```
curl.exe -H "Authorization: Bearer lb_..." http://localhost:3200/api/v1/me
```

## Skill de Claude Code

`docs/skill/SKILL.md` es la skill que permite a Claude Code operar Logbook con `curl` contra la API (dejar registro en una tarjeta, listar pendientes, crear y mover tarjetas, resumen del día o la semana). Se instala copiándola a `C:\Users\fmira\.claude\skills\logbook\SKILL.md`; los secretos van en `C:\Users\fmira\.config\logbook\env`, fuera del repo. Los pasos están al final del propio archivo ("Instalación").

## Prueba de humo

Con la API corriendo y un token Bearer, `scripts/smoke.sh` crea un proyecto y una tarjeta, agrega una nota, la mueve a `blocked` con motivo, busca y pide `/summary`; al final archiva el proyecto de prueba. No necesita `jq`.

```
LOGBOOK_TOKEN=lb_... bash scripts/smoke.sh
```

`LOGBOOK_URL` es opcional (por defecto `http://localhost:3200/api/v1`). El script nunca imprime el token.

## Comandos (desde la raíz)

| Comando          | Qué hace                              |
| ---------------- | ------------------------------------- |
| `pnpm dev`       | API y web en modo desarrollo          |
| `pnpm typecheck` | `tsc --noEmit` en los tres paquetes   |
| `pnpm lint`      | ESLint y `prettier --check`           |
| `pnpm format`    | Prettier en modo escritura            |
| `pnpm test`      | Vitest en api y web                   |
| `pnpm build`     | API (`tsc`) y web (`vite build`)      |
| `pnpm db:up`     | Levanta los Postgres de desarrollo    |
| `pnpm db:down`   | Los detiene (conserva el volumen dev) |
