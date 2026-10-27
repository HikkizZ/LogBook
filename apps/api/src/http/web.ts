import { existsSync } from 'node:fs';
import path from 'node:path';
import { static as serveStatic } from 'express';
import type { Express, Response } from 'express';

const IMMUTABLE = 'public, max-age=31536000, immutable';

/**
 * RD-03: sirve la web compilada (`apps/web/dist`) desde la misma app. Solo se activa si `dir` tiene un
 * `index.html`; en desarrollo la web la sirve Vite. Va después de `/api/v1`, así que lo que la API
 * ya resolvió no llega aquí.
 */
export function mountWeb(app: Express, dir: string | undefined): void {
  const root = dir?.trim() ? path.resolve(dir.trim()) : '';
  const indexFile = path.join(root, 'index.html');
  if (!root || !existsSync(indexFile)) return;

  // Los nombres de /assets llevan hash del contenido: nunca cambian, se cachean un año.
  app.use(
    serveStatic(root, {
      index: false,
      setHeaders: (res: Response, filePath: string) => {
        const rel = path.relative(root, filePath).split(path.sep).join('/');
        if (rel.startsWith('assets/')) res.setHeader('Cache-Control', IMMUTABLE);
        else if (rel === 'index.html') res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );

  // Un asset que no existe es 404, no el HTML del SPA (evita servir HTML como si fuera un script viejo).
  app.use('/assets', (_req, res) => {
    res.status(404).type('text/plain').send('Not Found');
  });

  // Fallback del SPA: cualquier GET/HEAD que no sea de la API recibe index.html.
  app.use((req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || /^\/api(\/|$)/.test(req.path)) {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexFile, (err) => {
      if (err) next(err);
    });
  });
}
