import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { pino } from 'pino';

const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });
const port = Number(process.env['PORT'] ?? 3200);

const app = express();
app.use(helmet());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 600 }));

// TODO(1.x): db real en el health check cuando exista el DataSource.
app.get('/api/v1/health', (_req, res) => {
  res.json({ ok: true, db: false });
});

app.listen(port, () => {
  logger.info({ port }, 'API escuchando');
});
