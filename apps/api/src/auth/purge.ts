import type { Logger } from 'pino';
import { purgeSessions } from './sessions.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Purga sesiones vencidas o revocadas ahora y cada 24 h. El temporizador no mantiene vivo el proceso. */
export function startSessionPurge(log: Logger): NodeJS.Timeout {
  const run = (): void => {
    purgeSessions().then(
      (count) => log.info({ count }, 'sesiones purgadas'),
      (err: unknown) => log.error({ err }, 'falló la purga de sesiones'),
    );
  };
  run();
  return setInterval(run, DAY_MS).unref();
}
