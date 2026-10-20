import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { AppError } from './errors.js';

const WINDOW_MS = 15 * 60 * 1000;

/** RS-05: 600 / 15 min por credencial (id interno, nunca el secreto); por IP si no hay credencial. */
export function apiRateLimit(): RequestHandler {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      if (req.auth?.via === 'token') return `token:${req.auth.tokenId}`;
      if (req.auth?.via === 'session') return `session:${req.auth.sessionId}`;
      return `ip:${ipKeyGenerator(req.ip ?? '')}`;
    },
    handler: (_req, _res, next) => {
      next(new AppError('RATE_LIMITED'));
    },
  });
}

/** RS-05: 5 intentos fallidos / 15 min por IP en el login (los éxitos no cuentan). */
export function loginRateLimit(): RequestHandler {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit: 5,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip ?? '')}`,
    handler: (_req, _res, next) => {
      next(new AppError('RATE_LIMITED'));
    },
  });
}
