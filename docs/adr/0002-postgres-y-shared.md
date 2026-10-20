# ADR 0002 — Postgres 18 en Docker y `shared` compilado con `tsc`

Estado: aceptada (2026-10-20; preguntas 8 y 9 de [[../spec/00_logbook]] y decisión del mismo día sobre `shared`). Implementada en la fase 0/1 (`docker-compose.dev.yml`, `packages/shared`).

## Decisión 1 — Postgres 18 en Docker, en el PC y en el servidor

**Contexto.** El esquema usa `uuidv7()` nativo como `DEFAULT` de todas las claves primarias (ordenables por tiempo, generadas por la base y no por la app). Esa función llega en PostgreSQL 18. En el PC tengo instalado un Postgres 16, y en Nexus mi patrón es un contenedor de base por app.

**Decisión.**
- En desarrollo, **Postgres 18 en Docker** (`docker-compose.dev.yml`, `postgres:18-alpine`): `db-dev` en `127.0.0.1:5435` con volumen persistente y `db-test` en `127.0.0.1:5436` sobre `tmpfs`. Los tests cargan `.env.test` pisando el entorno, así que siempre apuntan a `db-test`.
- En el servidor, **un contenedor de Postgres propio para Logbook** dentro de su compose, solo en la red interna, sin `ports`, datos en `/srv/data/logbook/postgres`. No un Postgres instalado en el host ni uno compartido entre apps.

**Alternativas descartadas.**
- *El Postgres 16 local del PC*: no tiene `uuidv7()`, las migraciones fallarían, y quiero la misma versión mayor que en producción.
- *Postgres instalado en el host del VPS o compartido entre apps*: pierde el aislamiento por app, obliga a una sola versión para todas, y el respaldo/restore deja de ser por app. Los ~30–50 MB de RAM extra por contenedor no importan en el VPS-3.
- *Usar el Postgres de pruebas de Nexus por túnel SSH para desarrollar*: mezclaría datos de pruebas con los de desarrollo y dependería de la red.

**Consecuencias.** `pnpm db:up` antes de `pnpm dev` o `pnpm test`; los puertos 5435/5436 quedan reservados (5433 lo usa zydesk). Al actualizar la versión mayor de Postgres, se hace por app con `pg_dump`/restore.

## Decisión 2 — `packages/shared` se compila con `tsc` a `dist/`

**Contexto.** `shared` tiene los tipos y los esquemas Zod que usan la API (Node, `NodeNext`) y el frontend (Vite). Al principio `package.json` apuntaba a `src/index.ts`: funciona con `tsx` y con Vite, pero en producción la API corre con `node dist/server.js` y Node no carga `.ts`.

**Decisión.** `shared` se compila con `tsc` (`declaration: true`, `outDir: dist`) y su `package.json` exporta `./dist/index.js` con tipos en `./dist/index.d.ts`. `pnpm -r build` compila `shared` antes que `api` y `web`; los scripts `dev`, `typecheck`, `lint` y `test` de la raíz hacen `pnpm --filter shared build` primero, y `pnpm dev` corre además un `tsc --watch` de `shared`.

**Alternativas descartadas.**
- *Empaquetar la API con esbuild/tsup* (que inlinea `shared`): una herramienta más, y TypeORM con bundler exige registrar las entidades por import explícito en vez de por patrón.
- *Correr `tsx` en producción*: cargar TypeScript en el contenedor para no compilar un paquete de 50 líneas.
- *Importar `src/index.ts` con `exports` condicionales por entorno*: dos resoluciones distintas para el mismo paquete, difícil de depurar cuando algo no coincide.

**Consecuencias.** Después de `git pull` o de tocar `shared` hay que recompilarlo (lo hacen los scripts de la raíz; en el editor, el `tsc --watch` de `pnpm dev`). `dist/` está en `.gitignore`.
