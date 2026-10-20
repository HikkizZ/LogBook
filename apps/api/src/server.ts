import { createApp } from './app.js';
import { assertPasswordHash } from './auth/password.js';
import { startSessionPurge } from './auth/purge.js';
import { setDataSource } from './db/client.js';
import { createDataSource } from './db/data-source.js';
import { loadEnv } from './env.js';
import { createLogger } from './logger.js';

loadEnv();
const logger = createLogger();

for (const name of ['DATABASE_URL', 'APP_ORIGIN', 'ADMIN_PASSWORD_HASH']) {
  if (!process.env[name]) {
    logger.fatal(`Falta la variable de entorno ${name}`);
    process.exit(1);
  }
}

try {
  assertPasswordHash(process.env['ADMIN_PASSWORD_HASH'] ?? '');
} catch (err) {
  logger.fatal((err as Error).message);
  process.exit(1);
}

const dataSource = createDataSource(process.env['DATABASE_URL']);
await dataSource.initialize();
setDataSource(dataSource);

const port = Number(process.env['PORT'] ?? 3200);
createApp({ logger }).listen(port, () => {
  logger.info({ port }, 'API escuchando');
});
startSessionPurge(logger);
