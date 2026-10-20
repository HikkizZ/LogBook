import { Writable } from 'node:stream';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDataSource } from '../db/client.js';
import { createLogger } from '../logger.js';
import { CSRF, TEST_ORIGIN, app, login, newBearer, probeApp } from '../test/helpers.js';
import { revokeSession } from './sessions.js';
import { createToken } from './tokens.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const T0 = new Date('2026-03-01T10:00:00Z');
const PROBE = '/api/v1/_auth-probe';

afterEach(() => {
  vi.useRealTimers();
});

describe('RS-08 cabeceras de seguridad', () => {
  it('RS-08 la CSP es exactamente la de la spec y van las demás cabeceras', async () => {
    const res = await request(app()).get('/api/v1/health');
    // helmet separa las directivas con ';' sin espacio; se compara directiva por directiva.
    const directives = String(res.headers['content-security-policy']).split(';');
    expect(directives.join('; ')).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('RS-09 no hay CORS: ni el preflight recibe Access-Control-Allow-*', async () => {
    const res = await request(app())
      .options('/api/v1/tokens')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'x-logbook-csrf');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-headers']).toBeUndefined();
  });
});

describe('RS-16 límite de body', () => {
  it('RS-16 un body de más de 256 KB responde 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await request(app())
      .post('/api/v1/auth/login')
      .set(CSRF)
      .send({ password: 'a'.repeat(300 * 1024) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('RS-10 requireAuth (precedencia de §4.1)', () => {
  it('RS-10 sin credencial responde 401 sin tocar la cookie', async () => {
    const res = await request(probeApp()).get(PROBE);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('RS-10 Bearer válido responde 200 con via token', async () => {
    const res = await request(probeApp())
      .get(PROBE)
      .set('Authorization', await newBearer());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ via: 'token' });
  });

  it('RS-10 cookie válida responde 200 con via session', async () => {
    const application = probeApp();
    const cookie = await login(application);
    const res = await request(application).get(PROBE).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ via: 'session' });
  });

  it('RS-10 Bearer vencido + cookie válida responde 401 y no cae a la cookie', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    const { token } = await createToken('x');
    const application = probeApp();

    const expiredAt = T0.getTime() + 90 * DAY + 1000;
    vi.setSystemTime(expiredAt - HOUR);
    const cookie = await login(application);
    vi.setSystemTime(expiredAt);

    const cookieOnly = await request(application).get(PROBE).set('Cookie', cookie);
    expect(cookieOnly.status).toBe(200);

    const both = await request(application)
      .get(PROBE)
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', cookie);
    expect(both.status).toBe(401);
    expect(both.headers['set-cookie']).toBeUndefined();
  });

  it('RS-10 un Authorization que no es un Bearer válido responde 401 aunque la cookie sea buena', async () => {
    const application = probeApp();
    const cookie = await login(application);
    for (const header of ['Basic abc', 'Bearer', 'Bearer basura', `Bearer ${'a'.repeat(5000)}`]) {
      const res = await request(application)
        .get(PROBE)
        .set('Authorization', header)
        .set('Cookie', cookie);
      expect(res.status).toBe(401);
    }
  });

  it('RS-10 cookie vencida responde 401 y Set-Cookie con Max-Age=0', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    const application = probeApp();
    const cookie = await login(application);
    vi.setSystemTime(T0.getTime() + 12 * HOUR + 60_000);
    const res = await request(application).get(PROBE).set('Cookie', cookie);
    expect(res.status).toBe(401);
    expect(String(res.headers['set-cookie'])).toContain('Max-Age=0');
  });

  it('RS-10 cookie con formato inválido o absurdamente larga responde 401 y borra la cookie', async () => {
    const application = probeApp();
    for (const bad of ['__Host-lb_session=basura', `__Host-lb_session=${'a'.repeat(5000)}`]) {
      const res = await request(application).get(PROBE).set('Cookie', bad);
      expect(res.status).toBe(401);
      expect(String(res.headers['set-cookie'])).toContain('Max-Age=0');
    }
  });

  it('RS-10 cookie revocada responde 401 y borra la cookie', async () => {
    const application = probeApp();
    const cookie = await login(application);
    const [row] = await getDataSource().query<{ id: string }[]>('SELECT id FROM session');
    await revokeSession(row?.id as string);
    const res = await request(application).get(PROBE).set('Cookie', cookie);
    expect(res.status).toBe(401);
    expect(String(res.headers['set-cookie'])).toContain('Max-Age=0');
  });
});

describe('RS-10 csrfGuard', () => {
  it('RS-10 cookie + Origin correcto + header responde 200', async () => {
    const application = probeApp();
    const cookie = await login(application);
    const res = await request(application).post(PROBE).set('Cookie', cookie).set(CSRF);
    expect(res.status).toBe(200);
  });

  it('RS-10 cookie sin header X-Logbook-CSRF responde 403', async () => {
    const application = probeApp();
    const cookie = await login(application);
    const res = await request(application)
      .post(PROBE)
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('RS-10 cookie con Origin ajeno responde 403', async () => {
    const application = probeApp();
    const cookie = await login(application);
    const res = await request(application)
      .post(PROBE)
      .set('Cookie', cookie)
      .set({ Origin: 'https://evil.example', 'X-Logbook-CSRF': '1' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('RS-10 cookie sin Origin responde 403', async () => {
    const application = probeApp();
    const cookie = await login(application);
    const res = await request(application)
      .post(PROBE)
      .set('Cookie', cookie)
      .set('X-Logbook-CSRF', '1');
    expect(res.status).toBe(403);
  });

  it('RS-10 GET con cookie sin header responde 200', async () => {
    const application = probeApp();
    const cookie = await login(application);
    const res = await request(application).get(PROBE).set('Cookie', cookie);
    expect(res.status).toBe(200);
  });

  it('RS-10 Bearer sin header ni Origin responde 200 (no requiere CSRF)', async () => {
    const res = await request(probeApp())
      .post(PROBE)
      .set('Authorization', await newBearer());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ via: 'token' });
  });
});

describe('RS-05 rate limit general', () => {
  it('RS-05 600 peticiones / 15 min por credencial: la 601 da 429 y otra credencial no se ve afectada', async () => {
    const application = probeApp();
    const a = await newBearer('a');
    const b = await newBearer('b');
    for (let i = 0; i < 600; i++) {
      const res = await request(application).get(PROBE).set('Authorization', a);
      if (res.status !== 200) throw new Error(`petición ${i + 1}: ${res.status}`);
    }
    const limited = await request(application).get(PROBE).set('Authorization', a);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');

    const other = await request(application).get(PROBE).set('Authorization', b);
    expect(other.status).toBe(200);
  }, 60_000);
});

describe('RS-13 logs de acceso', () => {
  it('RS-13 Authorization y Cookie no dejan token ni ID de sesión en pino; sí token:<prefijo> y session:<id>', async () => {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(String(chunk));
        cb();
      },
    });
    const application = probeApp({ logger: createLogger('info', stream) });

    const { token, row } = await createToken('x');
    await request(application).get(PROBE).set('Authorization', `Bearer ${token}`);

    const cookie = await login(application);
    const sessionValue = cookie.split('=')[1] as string;
    await request(application).get(`${PROBE}?q=secreto`).set('Cookie', cookie);

    await new Promise((r) => setTimeout(r, 50));
    const log = chunks.join('');
    expect(log).toContain('"statusCode":200');
    expect(log).toContain(`token:${row.prefix}`);
    expect(log).toMatch(/session:[0-9a-f-]{36}/);
    expect(log).not.toContain(token);
    expect(log).not.toContain(token.split('.')[1] as string);
    expect(log).not.toContain(sessionValue);
    expect(log).not.toContain('secreto');
    expect(log).not.toMatch(/authorization|cookie/i);
  });
});
