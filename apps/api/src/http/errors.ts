import type { ErrorRequestHandler } from 'express';
import { createLogger } from '../logger.js';

export interface ErrorDetail {
  path: string;
  message: string;
}

// Spec §4.2: código → estado HTTP.
const STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof STATUS;

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'Solicitud inválida',
  UNAUTHORIZED: 'No autenticado',
  FORBIDDEN: 'No permitido',
  NOT_FOUND: 'No encontrado',
  CONFLICT: 'Conflicto',
  PAYLOAD_TOO_LARGE: 'Cuerpo demasiado grande',
  RATE_LIMITED: 'Demasiadas solicitudes',
  INTERNAL: 'Error interno',
};

export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string = DEFAULT_MESSAGE[code],
    readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
    this.status = STATUS[code];
  }
}

interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: ErrorDetail[] };
}

function body(code: ErrorCode, message: string, details?: ErrorDetail[]): ErrorBody {
  return { error: { code, message, ...(details ? { details } : {}) } };
}

const fallbackLogger = createLogger();

/** Handler global (va al final de la cadena): formato de §4.2, nunca el stack ni el mensaje de un error inesperado. */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json(body(err.code, err.message, err.details));
    return;
  }

  // Errores de express.json (body-parser): llevan `type`.
  const type =
    typeof err === 'object' && err !== null ? (err as { type?: unknown }).type : undefined;
  if (type === 'entity.too.large') {
    res.status(413).json(body('PAYLOAD_TOO_LARGE', DEFAULT_MESSAGE.PAYLOAD_TOO_LARGE));
    return;
  }
  if (type === 'entity.parse.failed') {
    res.status(400).json(body('VALIDATION_ERROR', 'JSON inválido'));
    return;
  }

  // pino-http pone req.log; en apps sin él (tests de los middlewares sueltos) se usa el logger propio.
  const log = (req as { log?: typeof fallbackLogger }).log ?? fallbackLogger;
  log.error({ err }, 'error no controlado');
  res.status(500).json(body('INTERNAL', DEFAULT_MESSAGE.INTERNAL));
};
