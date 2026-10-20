import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';

export function createApp(): Express {
  const app = express();
  app.use(helmet());
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 600 }));

  // TODO(1.x): db real en el health check cuando el DataSource llegue a la app.
  app.get('/api/v1/health', (_req, res) => {
    res.json({ ok: true, db: false });
  });

  return app;
}
