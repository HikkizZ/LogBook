# syntax=docker/dockerfile:1

# ---- Etapa 1: construye shared, api (tsc) y web (Vite) ----
FROM node:22-alpine AS build
# pnpm queda fijado por "packageManager" en package.json.
RUN corepack enable
WORKDIR /repo

# Primero solo los manifiestos: la instalación se cachea mientras no cambien las dependencias.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# api + su dependencia `shared` compilada, solo dependencias de producción. `--legacy` porque el
# workspace no usa inject-workspace-packages.
RUN pnpm --filter api deploy --prod --legacy /out \
    && rm -rf /out/src /out/tsconfig.json /out/tsconfig.build.json /out/vitest.config.ts

# ---- Etapa 2: imagen final mínima, sin pnpm ni código fuente ----
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIST_DIR=/app/web
WORKDIR /app

COPY --from=build --chown=node:node /out/ ./
COPY --from=build --chown=node:node /repo/apps/web/dist ./web

# Sin secretos: DATABASE_URL, ADMIN_PASSWORD_HASH, etc. llegan por el entorno del contenedor (env_file).
USER node
EXPOSE 3000
CMD ["sh", "-c", "node dist/migrate.js && node dist/server.js"]
