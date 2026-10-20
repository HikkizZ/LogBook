import { pino } from 'pino';
import { createApp } from './app.js';
import { loadEnv } from './env.js';

loadEnv();

const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });
const port = Number(process.env['PORT'] ?? 3200);

createApp().listen(port, () => {
  logger.info({ port }, 'API escuchando');
});
