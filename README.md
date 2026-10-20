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
