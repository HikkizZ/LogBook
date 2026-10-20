import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CSRF, TEST_PASSWORD, app, login, newBearer } from '../test/helpers.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const T0 = new Date('2026-03-01T10:00:00.000Z');
const LOGIN = '/api/v1/auth/login';
const ME = '/api/v1/me';

afterEach(() => {
  vi.useRealTimers();
});

describe('RS-02 / RS-10 POST /auth/login', () => {
  it('RS-02 contraseña correcta: 204 y Set-Cookie con los flags de __Host-', async () => {
    const res = await request(app()).post(LOGIN).set(CSRF).send({ password: TEST_PASSWORD });
    expect(res.status).toBe(204);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(
      /^__Host-lb_session=[A-Za-z0-9_-]{43}; Path=\/; Secure; HttpOnly; SameSite=Strict$/,
    );
  });

  it('RS-02 contraseña incorrecta: 401 UNAUTHORIZED sin Set-Cookie', async () => {
    const res = await request(app()).post(LOGIN).set(CSRF).send({ password: 'otra' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('RS-07 body inválido responde 400', async () => {
    const res = await request(app()).post(LOGIN).set(CSRF).send({});
    expect(res.status).toBe(400);
  });

  it('B-3 RS-07 una contraseña de más de 1024 caracteres responde 400 VALIDATION_ERROR', async () => {
    const res = await request(app())
      .post(LOGIN)
      .set(CSRF)
      .send({ password: 'a'.repeat(1025) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const ok = await request(app())
      .post(LOGIN)
      .set(CSRF)
      .send({ password: 'a'.repeat(1024) });
    expect(ok.status).toBe(401);
  });

  it('B-3 RS-05: cinco intentos de 1025 caracteres no consumen el límite del login', async () => {
    const application = app();
    for (let i = 0; i < 5; i++) {
      const res = await request(application)
        .post(LOGIN)
        .set(CSRF)
        .send({ password: 'a'.repeat(1025) });
      expect(res.status).toBe(400);
    }
    const ok = await request(application).post(LOGIN).set(CSRF).send({ password: TEST_PASSWORD });
    expect(ok.status).toBe(204);
  });

  it('B-2 RS-10 las respuestas de /api/v1 llevan Cache-Control: no-store', async () => {
    const application = app();
    const cookie = await login(application);
    const bearer = await newBearer();
    for (const path of [ME, '/api/v1/tokens', '/api/v1/health', '/api/v1/no-existe']) {
      const res = await request(application).get(path).set('Cookie', cookie);
      expect(res.headers['cache-control'], path).toContain('no-store');
    }
    const unauth = await request(application).get(ME);
    expect(unauth.status).toBe(401);
    expect(unauth.headers['cache-control']).toContain('no-store');
    const viaToken = await request(application).get(ME).set('Authorization', bearer);
    expect(viaToken.headers['cache-control']).toContain('no-store');
    const loginRes = await request(application).post(LOGIN).set(CSRF).send({ password: 'mal' });
    expect(loginRes.headers['cache-control']).toContain('no-store');
  });

  it('RS-05 el sexto intento fallido en 15 min responde 429, también con la contraseña buena', async () => {
    const application = app();
    for (let i = 0; i < 5; i++) {
      const res = await request(application).post(LOGIN).set(CSRF).send({ password: 'mal' });
      expect(res.status).toBe(401);
    }
    const sixth = await request(application)
      .post(LOGIN)
      .set(CSRF)
      .send({ password: TEST_PASSWORD });
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe('RATE_LIMITED');
  });

  it('M-1 RS-05: cinco rechazos por CSRF o validación no consumen el límite del login', async () => {
    const application = app();
    for (let i = 0; i < 5; i++) {
      const res = await request(application)
        .post(LOGIN)
        .set('Origin', CSRF.Origin)
        .send({ password: TEST_PASSWORD });
      expect(res.status).toBe(403);
    }
    for (let i = 0; i < 5; i++) {
      const res = await request(application).post(LOGIN).set(CSRF).send({});
      expect(res.status).toBe(400);
    }
    const ok = await request(application).post(LOGIN).set(CSRF).send({ password: TEST_PASSWORD });
    expect(ok.status).toBe(204);
  });

  it('RS-10 login sin X-Logbook-CSRF o con Origin ajeno o ausente responde 403', async () => {
    const application = app();
    const body = { password: TEST_PASSWORD };
    const noHeader = await request(application).post(LOGIN).set('Origin', CSRF.Origin).send(body);
    expect(noHeader.status).toBe(403);
    const foreign = await request(application)
      .post(LOGIN)
      .set({ Origin: 'https://evil.example', 'X-Logbook-CSRF': '1' })
      .send(body);
    expect(foreign.status).toBe(403);
    const noOrigin = await request(application).post(LOGIN).set('X-Logbook-CSRF', '1').send(body);
    expect(noOrigin.status).toBe(403);
    expect(noHeader.headers['set-cookie']).toBeUndefined();
  });

  it('RS-10 login con una cookie válida previa la revoca y emite otro ID (rotación)', async () => {
    const application = app();
    const old = await login(application);
    const res = await request(application)
      .post(LOGIN)
      .set(CSRF)
      .set('Cookie', old)
      .send({ password: TEST_PASSWORD });
    expect(res.status).toBe(204);
    const fresh = String(res.headers['set-cookie']).split(';')[0];
    expect(fresh).not.toBe(old);

    for (let i = 0; i < 2; i++) {
      expect((await request(application).get(ME).set('Cookie', old)).status).toBe(401);
    }
    expect(
      (
        await request(application)
          .get(ME)
          .set('Cookie', fresh as string)
      ).status,
    ).toBe(200);
  });
});

describe('RS-03 GET /me', () => {
  it('RS-03 cookie: auth session con expiresAt = login + 7 d e idleExpiresAt = ahora + 12 h', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    const application = app();
    const cookie = await login(application);
    const res = await request(application).get(ME).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      auth: 'session',
      expiresAt: new Date(T0.getTime() + 7 * DAY).toISOString(),
      idleExpiresAt: new Date(T0.getTime() + 12 * HOUR).toISOString(),
    });
  });

  it('RS-03 Bearer: auth token con name, prefix y expiresAt', async () => {
    const res = await request(app())
      .get(ME)
      .set('Authorization', await newBearer('Claude Code PC'));
    expect(res.status).toBe(200);
    expect(res.body.auth).toBe('token');
    expect(res.body.name).toBe('Claude Code PC');
    expect(res.body.prefix).toMatch(/^lb_[A-Za-z0-9_-]{8}$/);
    expect(typeof res.body.expiresAt).toBe('string');
  });

  it('RS-03 sin credencial responde 401', async () => {
    expect((await request(app()).get(ME)).status).toBe(401);
  });

  it('RS-03 sin peticiones, a login + 12 h 1 min /me responde 401', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    const application = app();
    const cookie = await login(application);
    vi.setSystemTime(T0.getTime() + 12 * HOUR + MIN);
    expect((await request(application).get(ME).set('Cookie', cookie)).status).toBe(401);
  });

  it('RS-03 con peticiones cada hora la sesión sigue hasta login + 7 d y entonces responde 401', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    const application = app();
    const cookie = await login(application);
    for (let h = 1; h < 7 * 24; h++) {
      vi.setSystemTime(T0.getTime() + h * HOUR);
      const res = await request(application).get(ME).set('Cookie', cookie);
      if (res.status !== 200) throw new Error(`hora ${h}: ${res.status}`);
    }
    vi.setSystemTime(T0.getTime() + 7 * DAY);
    expect((await request(application).get(ME).set('Cookie', cookie)).status).toBe(401);
  }, 30_000);
});

describe('RS-03 logout y logout-all', () => {
  it('RS-03 logout revoca la sesión en el servidor y borra la cookie', async () => {
    const application = app();
    const cookie = await login(application);
    const res = await request(application)
      .post('/api/v1/auth/logout')
      .set(CSRF)
      .set('Cookie', cookie);
    expect(res.status).toBe(204);
    expect(String(res.headers['set-cookie'])).toContain('Max-Age=0');
    expect((await request(application).get(ME).set('Cookie', cookie)).status).toBe(401);
  });

  it('RS-03 logout-all desde la sesión A deja A y B en 401', async () => {
    const application = app();
    const a = await login(application);
    const b = await login(application);
    expect(a).not.toBe(b);
    const res = await request(application)
      .post('/api/v1/auth/logout-all')
      .set(CSRF)
      .set('Cookie', a);
    expect(res.status).toBe(204);
    expect(String(res.headers['set-cookie'])).toContain('Max-Age=0');
    expect((await request(application).get(ME).set('Cookie', a)).status).toBe(401);
    expect((await request(application).get(ME).set('Cookie', b)).status).toBe(401);
  });

  it('RS-03 logout y logout-all con Bearer responden 403 FORBIDDEN', async () => {
    const application = app();
    const bearer = await newBearer();
    for (const path of ['/api/v1/auth/logout', '/api/v1/auth/logout-all']) {
      const res = await request(application).post(path).set('Authorization', bearer);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('RS-10 logout con cookie pero sin header CSRF responde 403 y no revoca', async () => {
    const application = app();
    const cookie = await login(application);
    const res = await request(application).post('/api/v1/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(403);
    expect((await request(application).get(ME).set('Cookie', cookie)).status).toBe(200);
  });

  it('RS-03 logout sin credencial responde 401', async () => {
    const res = await request(app()).post('/api/v1/auth/logout').set(CSRF);
    expect(res.status).toBe(401);
  });
});
