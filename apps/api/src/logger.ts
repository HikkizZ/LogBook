import { pino, stdSerializers } from 'pino';
import type { DestinationStream, Logger } from 'pino';
import { QueryFailedError } from 'typeorm';

// RS-11: nunca en los logs.
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'req.headers["cf-access-client-secret"]',
  'req.headers["x-hub-signature-256"]',
];

/** Propiedades que pueden llevar contenido del usuario (SQL con sus parámetros, `detail`/`where` de Postgres). */
const SENSITIVE_ERR_KEYS = ['query', 'parameters', 'driverError', 'detail', 'where'];
const MAX_CAUSE_DEPTH = 5;

function withoutSensitive(obj: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([key]) => !SENSITIVE_ERR_KEYS.includes(key)),
  );
}

function serializeError(err: Error, depth: number): Record<string, unknown> {
  const out = withoutSensitive(stdSerializers.err(err));
  if (err instanceof QueryFailedError) {
    // Solo datos no sensibles del driver; el mensaje se omite porque Postgres cita en él los valores
    // ("invalid input syntax for type integer: "…"").
    const driver = (err.driverError ?? {}) as Record<string, unknown>;
    const safe = (key: string): unknown =>
      typeof driver[key] === 'string' ? driver[key] : undefined;
    return {
      type: out['type'],
      message: 'consulta fallida (mensaje del driver omitido)',
      stack:
        typeof out['stack'] === 'string' && err.message
          ? out['stack'].split(err.message).join('[mensaje omitido]')
          : undefined,
      code: safe('code'),
      constraint: safe('constraint'),
      table: safe('table'),
      column: safe('column'),
    };
  }
  if (err.cause instanceof Error && depth < MAX_CAUSE_DEPTH) {
    out['cause'] = serializeError(err.cause, depth + 1);
  }
  return out;
}

/**
 * RS-13 / RS-17: serializador de `err` que nunca deja salir `query`, `parameters` ni `driverError` (ni el `cause`
 * que los lleve). `errorHandler` lo aplica antes de loguear porque pino-http pasa los errores por su propio
 * serializador y entrega objetos planos.
 */
export function serializeErr(err: unknown): unknown {
  if (err instanceof Error) return serializeError(err, 0);
  if (typeof err === 'object' && err !== null) {
    return withoutSensitive(err);
  }
  return err;
}

export function createLogger(
  level: string = process.env['NODE_ENV'] === 'test'
    ? 'silent'
    : (process.env['LOG_LEVEL'] ?? 'info'),
  destination?: DestinationStream,
): Logger {
  return pino(
    {
      level,
      redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
      serializers: { err: serializeErr },
    },
    destination,
  );
}

export const logger = createLogger();
