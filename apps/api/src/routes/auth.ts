import { Router } from 'express';
import type { Request } from 'express';
import { loginBodySchema } from 'shared';
import type { LoginBody } from 'shared';
import { authenticate, requireAuth, requireCsrf, requireSession } from '../auth/middleware.js';
import { clearSessionCookie, sessionCookie } from '../auth/cookie.js';
import { verifyPassword } from '../auth/password.js';
import { createSession, revokeAllSessions, revokeSession } from '../auth/sessions.js';
import { AppError } from '../http/errors.js';
import { loginRateLimit } from '../http/rate-limit.js';
import { validate } from '../http/validate.js';

interface AuthRoutesOptions {
  appOrigin: string;
  adminPasswordHash: string;
}

/** Id interno de la sesión de la petición; `requireSession` ya garantizó que existe. */
function currentSessionId(req: Request): string {
  if (req.auth?.via !== 'session') throw new AppError('FORBIDDEN');
  return req.auth.sessionId;
}

/**
 * `POST /auth/login` (spec §4.1). Ruta pública: se monta antes del `requireAuth` general y con su propio
 * limitador, que va tras CSRF y validación para contar solo contraseñas incorrectas (RS-05).
 */
export function loginRoutes({ appOrigin, adminPasswordHash }: AuthRoutesOptions): Router {
  const router = Router();

  router.post(
    '/auth/login',
    authenticate,
    requireCsrf(appOrigin),
    validate({ body: loginBodySchema }),
    loginRateLimit(),
    async (req, res) => {
      const { password } = req.body as LoginBody;
      if (!(await verifyPassword(adminPasswordHash, password))) {
        throw new AppError('UNAUTHORIZED', 'Contraseña incorrecta');
      }
      // Rotación (RF-63): la sesión de la cookie entrante, si era válida, se revoca.
      if (req.auth?.via === 'session') await revokeSession(req.auth.sessionId);
      const { sessionId } = await createSession();
      res.setHeader('Set-Cookie', sessionCookie(sessionId));
      res.status(204).end();
    },
  );

  return router;
}

/** `/auth/logout`, `/auth/logout-all` y `/me` (spec §4.1). */
export function authRoutes(): Router {
  const router = Router();

  router.post('/auth/logout', requireAuth, requireSession, async (req, res) => {
    await revokeSession(currentSessionId(req));
    res.setHeader('Set-Cookie', clearSessionCookie());
    res.status(204).end();
  });

  router.post('/auth/logout-all', requireAuth, requireSession, async (_req, res) => {
    await revokeAllSessions();
    res.setHeader('Set-Cookie', clearSessionCookie());
    res.status(204).end();
  });

  router.get('/me', requireAuth, (req, res) => {
    const auth = req.auth;
    if (auth?.via === 'token') {
      res.json({
        auth: 'token',
        name: auth.name,
        prefix: `lb_${auth.prefix}`,
        expiresAt: auth.expiresAt,
      });
      return;
    }
    if (auth?.via === 'session') {
      res.json({ auth: 'session', expiresAt: auth.expiresAt, idleExpiresAt: auth.idleExpiresAt });
    }
  });

  return router;
}
