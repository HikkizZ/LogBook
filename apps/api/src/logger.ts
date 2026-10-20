import { pino } from 'pino';
import type { DestinationStream, Logger } from 'pino';

// RS-11: nunca en los logs.
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'req.headers["cf-access-client-secret"]',
  'req.headers["x-hub-signature-256"]',
];

export function createLogger(
  level: string = process.env['NODE_ENV'] === 'test'
    ? 'silent'
    : (process.env['LOG_LEVEL'] ?? 'info'),
  destination?: DestinationStream,
): Logger {
  return pino({ level, redact: { paths: REDACT_PATHS, censor: '[Redacted]' } }, destination);
}

export const logger = createLogger();
