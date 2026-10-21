import type { Express, Router } from 'express';
import request from 'supertest';
import { createApp } from '../app.js';
import type { AppOptions } from '../app.js';
import { requireAuth } from '../auth/middleware.js';
import { createToken } from '../auth/tokens.js';

/** App Express sin puerto, lista para pasarla a Supertest: `request(app())`. */
export function app(options?: AppOptions): Express {
  return createApp(options);
}

/** Contraseña de prueba cuyo hash argon2id está en `.env.test` (`ADMIN_PASSWORD_HASH`). Nada real. */
export const TEST_PASSWORD = 'test-password-1234';
export const TEST_ORIGIN = 'http://localhost:3201';
export const CSRF = { Origin: TEST_ORIGIN, 'X-Logbook-CSRF': '1' } as const;

/** Ruta de prueba `/api/v1/_auth-probe`: solo existe en los tests que la piden. */
export function probeRoutes(router: Router): void {
  router.get('/_auth-probe', requireAuth, (req, res) => {
    res.json({ via: req.auth?.via });
  });
  router.post('/_auth-probe', requireAuth, (req, res) => {
    res.json({ via: req.auth?.via });
  });
}

export function probeApp(options?: AppOptions): Express {
  return app({ ...options, extraRoutes: probeRoutes });
}

/** Hace login y devuelve el valor `name=value` de la cookie, listo para el header `Cookie`. */
export async function login(application: Express): Promise<string> {
  const res = await request(application)
    .post('/api/v1/auth/login')
    .set(CSRF)
    .send({ password: TEST_PASSWORD });
  const setCookie = res.headers['set-cookie'] as string[] | undefined;
  const cookie = setCookie?.[0]?.split(';')[0];
  if (res.status !== 204 || !cookie) throw new Error(`login falló: ${res.status}`);
  return cookie;
}

export async function newBearer(name = 'Test'): Promise<string> {
  return `Bearer ${(await createToken(name)).token}`;
}

/** Cliente Supertest con `Authorization` fijo (por defecto un Bearer nuevo) y prefijo `/api/v1`. */
export async function client(application: Express = app(), authorization?: string) {
  const auth = authorization ?? (await newBearer());
  const base = (method: 'get' | 'post' | 'patch' | 'delete') => (path: string) =>
    request(application)[method](`/api/v1${path}`).set('Authorization', auth);
  return {
    get: base('get'),
    post: base('post'),
    patch: base('patch'),
    delete: base('delete'),
  };
}

export type TestClient = Awaited<ReturnType<typeof client>>;
