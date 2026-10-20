import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from '../http/errors.js';
import { SESSION_COOKIE_NAME, clearSessionCookie } from './cookie.js';
import { SESSION_IDLE_MS, verifySession } from './sessions.js';
import { verifyToken } from './tokens.js';

export type AuthContext =
  | { via: 'token'; tokenId: string; name: string; prefix: string; expiresAt: Date }
  | { via: 'session'; sessionId: string; expiresAt: Date; idleExpiresAt: Date };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      /** La petición traía una credencial y no sirvió; `requireAuth` responde 401 (y borra la cookie si era de sesión). */
      authFailure?: { clearCookie: boolean };
    }
  }
}

// Un Bearer válido mide 55 caracteres; nada más largo se consulta en la base.
const MAX_BEARER_LENGTH = 128;
const BEARER = /^Bearer (\S+)$/i;
const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Identifica la credencial (§4.1) sin rechazar: deja `req.auth` o `req.authFailure`.
 * Precedencia: con `Authorization` se evalúa solo el Bearer y un fallo no cae a la cookie.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (header !== undefined) {
    const match = header.length <= MAX_BEARER_LENGTH + 7 ? BEARER.exec(header) : null;
    const row = match?.[1] ? await verifyToken(match[1]) : null;
    if (row) {
      req.auth = {
        via: 'token',
        tokenId: row.id,
        name: row.name,
        prefix: row.prefix,
        expiresAt: row.expiresAt,
      };
    } else {
      req.authFailure = { clearCookie: false };
    }
    next();
    return;
  }

  const raw: unknown = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof raw === 'string' && raw.length > 0) {
    const row = await verifySession(raw);
    if (row) {
      req.auth = {
        via: 'session',
        sessionId: row.id,
        expiresAt: row.expiresAt,
        idleExpiresAt: new Date(row.lastSeenAt.getTime() + SESSION_IDLE_MS),
      };
    } else {
      req.authFailure = { clearCookie: true };
    }
  }
  next();
};

/** 401 si `authenticate` no encontró una credencial válida; con cookie fallida también la borra. */
export const requireAuth: RequestHandler = (req, res, next) => {
  if (req.auth) {
    next();
    return;
  }
  if (req.authFailure?.clearCookie) {
    res.setHeader('Set-Cookie', clearSessionCookie());
  }
  next(new AppError('UNAUTHORIZED'));
};

/** 403 si la petición no se autenticó por cookie de sesión (RS-03). */
export const requireSession: RequestHandler = (req, _res, next) => {
  if (req.auth?.via !== 'session') {
    next(new AppError('FORBIDDEN', 'Esta operación solo se permite con sesión (cookie)'));
    return;
  }
  next();
};

function checkCsrf(appOrigin: string, req: Request, next: NextFunction): void {
  const origin = req.headers.origin;
  if (appOrigin === '' || origin !== appOrigin) {
    next(new AppError('FORBIDDEN', 'Origin ausente o no permitido'));
    return;
  }
  if (req.headers['x-logbook-csrf'] !== '1') {
    next(new AppError('FORBIDDEN', 'Falta el header X-Logbook-CSRF'));
    return;
  }
  next();
}

/** CSRF (RS-10): solo en métodos que modifican y cuando la petición se autenticó por cookie. */
export function csrfGuard(appOrigin: string): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.auth?.via === 'session' && MUTATING_METHODS.has(req.method)) {
      checkCsrf(appOrigin, req, next);
      return;
    }
    next();
  };
}

/** CSRF incondicional, para `POST /auth/login`, que aún no tiene cookie. */
export function requireCsrf(appOrigin: string): RequestHandler {
  return (req, _res, next) => {
    checkCsrf(appOrigin, req, next);
  };
}

/** Etiqueta de la credencial para los logs (RS-13): nunca el secreto. */
export function authLabel(req: Request): string | undefined {
  if (req.auth?.via === 'token') return `token:${req.auth.prefix}`;
  if (req.auth?.via === 'session') return `session:${req.auth.sessionId}`;
  return undefined;
}
