import cookieParser from 'cookie-parser';
import express, { Router, json } from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { authLabel, authenticate, csrfGuard, requireAuth } from './auth/middleware.js';
import { getDataSource } from './db/client.js';
import { AppError, errorHandler } from './http/errors.js';
import { apiRateLimit } from './http/rate-limit.js';
import { mountWeb } from './http/web.js';
import { logger as defaultLogger } from './logger.js';
import { domainRoutes } from './modules/index.js';
import { authRoutes, loginRoutes } from './routes/auth.js';
import { tokensRoutes } from './routes/tokens.js';

export interface AppOptions {
  logger?: Logger;
  /** Monta rutas extra bajo `/api/v1`, ya detrás de la autenticación obligatoria y el CSRF (los tests lo usan para su ruta de prueba). */
  extraRoutes?: (router: Router) => void;
  /** Carpeta con la web compilada; por defecto `WEB_DIST_DIR`. Si no existe, la app solo sirve la API. */
  webDistDir?: string;
}

/** `TRUST_PROXY`: vacío = sin proxy; número = saltos; si no, subredes/IPs separadas por coma (RS-05). */
function trustProxySetting(value: string | undefined): boolean | number | string[] {
  const v = value?.trim() ?? '';
  if (v === '') return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v.split(',').map((s) => s.trim());
}

async function dbIsUp(): Promise<boolean> {
  try {
    await Promise.race([
      getDataSource().query('SELECT 1'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000).unref()),
    ]);
    return true;
  } catch {
    return false;
  }
}

/** Arma la app Express sin escuchar puerto. Lee `APP_ORIGIN`, `ADMIN_PASSWORD_HASH` y `TRUST_PROXY` del entorno. */
export function createApp(options: AppOptions = {}): Express {
  const appOrigin = process.env['APP_ORIGIN'] ?? '';
  const adminPasswordHash = process.env['ADMIN_PASSWORD_HASH'] ?? '';

  const app = express();
  app.set('trust proxy', trustProxySetting(process.env['TRUST_PROXY']));
  if (process.env['NODE_ENV'] === 'production' && !process.env['TRUST_PROXY']?.trim()) {
    (options.logger ?? defaultLogger).warn(
      'TRUST_PROXY vacío en producción: todas las peticiones comparten la IP del proxy y los límites por IP (RS-05) pasan a ser globales',
    );
  }

  // RS-13: método, ruta (sin query), status, duración y credencial; sin headers ni bodies.
  app.use(
    pinoHttp({
      logger: options.logger ?? defaultLogger,
      serializers: {
        req: (req: { id: unknown; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url.split('?')[0],
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      customProps: (req) => ({ auth: authLabel(req as express.Request) }),
    }),
  );

  // RS-08.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.use(json({ limit: '256kb' }));
  app.use(cookieParser());

  // RS-09: sin CORS (misma origen).
  const v1 = Router();

  // B-2: nada de lo que sirve la API (datos autenticados, errores) debe quedar en cachés.
  v1.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Rutas públicas (§4.1), antes de cualquier limitador general: /auth/login lleva el suyo (RS-05).
  // §4.12: si la base no responde, 503 para que el healthcheck de Docker lo vea.
  v1.get('/health', async (_req, res) => {
    const db = await dbIsUp();
    res.status(db ? 200 : 503).json({ ok: db, db });
  });
  v1.use(loginRoutes({ appOrigin, adminPasswordHash }));

  // Denegar por defecto: todo lo que se monte desde aquí exige autenticarse.
  v1.use(authenticate, apiRateLimit(), csrfGuard(appOrigin), requireAuth);
  v1.use(authRoutes());
  v1.use(tokensRoutes());
  v1.use(domainRoutes());
  options.extraRoutes?.(v1);
  // Después de requireAuth: sin credencial una ruta desconocida da 401, no un 404 que revele qué existe.
  v1.use(() => {
    throw new AppError('NOT_FOUND');
  });

  app.use('/api/v1', v1);
  mountWeb(app, options.webDistDir ?? process.env['WEB_DIST_DIR']);
  app.use(errorHandler);
  return app;
}
