import { Writable } from 'node:stream';
import type { Express, Router } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Project } from './entities/index.js';
import { createLogger } from './logger.js';
import { CSRF, TEST_PASSWORD, app, newBearer } from './test/helpers.js';
import { testDataSource } from './test/db.js';

describe('health', () => {
  it('GET /api/v1/health responde ok', async () => {
    const res = await request(app()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: true });
  });
});

describe('base de datos de test', () => {
  it('inserta un proyecto y lo lee, con id uuidv7 generado por Postgres', async () => {
    const repo = testDataSource().getRepository(Project);
    await repo.insert({ name: 'Proyecto de prueba', slug: 'proyecto-de-prueba', color: 'violeta' });

    const found = await repo.findOneByOrFail({ slug: 'proyecto-de-prueba' });
    expect(found.name).toBe('Proyecto de prueba');
    expect(found.wipLimit).toBe(3);
    expect(found.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
  });

  it('los tests arrancan con las tablas vacías (truncado entre tests)', async () => {
    expect(await testDataSource().getRepository(Project).count()).toBe(0);
  });
});

describe('M-2 RS-05 límites por IP', () => {
  it('M-2 RS-05: el límite general por IP no bloquea el login ni /health', async () => {
    const application = app();
    for (let i = 0; i < 600; i++) {
      const res = await request(application).get('/api/v1/health');
      if (res.status !== 200) throw new Error(`health ${i + 1}: ${res.status}`);
    }
    expect((await request(application).get('/api/v1/health')).status).toBe(200);
    const res = await request(application)
      .post('/api/v1/auth/login')
      .set(CSRF)
      .send({ password: TEST_PASSWORD });
    expect(res.status).toBe(204);
  }, 60_000);
});

describe('M-3 §4.1 denegar por defecto', () => {
  const sinGuard = (router: Router): void => {
    router.get('/_sin-guard', (_req, res) => {
      res.json({ ok: true });
    });
  };

  it('M-3 §4.1: una ruta montada bajo /api/v1 sin requireAuth responde 401', async () => {
    const application = app({ extraRoutes: sinGuard });
    expect((await request(application).get('/api/v1/_sin-guard')).status).toBe(401);
    const ok = await request(application)
      .get('/api/v1/_sin-guard')
      .set('Authorization', await newBearer());
    expect(ok.status).toBe(200);
  });

  it('M-3 §4.1: /health y /auth/login siguen abiertos sin credencial', async () => {
    const application = app({ extraRoutes: sinGuard });
    expect((await request(application).get('/api/v1/health')).status).toBe(200);
    const res = await request(application)
      .post('/api/v1/auth/login')
      .set(CSRF)
      .send({ password: TEST_PASSWORD });
    expect(res.status).toBe(204);
  });
});

describe('B-1 §4.2 rutas desconocidas', () => {
  it('B-1 §4.2: ruta inexistente bajo /api/v1 con credencial responde 404 JSON NOT_FOUND', async () => {
    const res = await request(app())
      .get('/api/v1/no-existe')
      .set('Authorization', await newBearer());
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(typeof res.body.error.message).toBe('string');
  });

  it('B-1 §4.2: sin credencial una ruta desconocida responde 401, no 404 (no revela qué existe)', async () => {
    const application = app();
    expect((await request(application).get('/api/v1/no-existe')).status).toBe(401);
    expect((await request(application).get('/api/v1/auth/login')).status).toBe(401);
  });
});

describe('B-4 RS-05 TRUST_PROXY', () => {
  const LOGIN = '/api/v1/auth/login';
  const failLogin = (application: Express, ip: string) =>
    request(application).post(LOGIN).set(CSRF).set('X-Forwarded-For', ip).send({ password: 'mal' });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('B-4 RS-05: con TRUST_PROXY=127.0.0.1 el límite de login se cuenta por la IP de X-Forwarded-For', async () => {
    vi.stubEnv('TRUST_PROXY', '127.0.0.1');
    const application = app();
    for (let i = 0; i < 5; i++) {
      expect((await failLogin(application, '203.0.113.5')).status).toBe(401);
    }
    expect((await failLogin(application, '203.0.113.6')).status).toBe(401);
    expect((await failLogin(application, '203.0.113.5')).status).toBe(429);
  });

  it('B-4 RS-05: sin TRUST_PROXY todos comparten una cuota (X-Forwarded-For se ignora)', async () => {
    vi.stubEnv('TRUST_PROXY', '');
    const application = app();
    for (let i = 0; i < 5; i++) {
      expect((await failLogin(application, '203.0.113.5')).status).toBe(401);
    }
    expect((await failLogin(application, '203.0.113.6')).status).toBe(429);
  });

  function logLines(): { chunks: string[]; stream: Writable } {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(String(chunk));
        cb();
      },
    });
    return { chunks, stream };
  }

  it('B-4 RS-05: warn al arrancar si NODE_ENV=production y TRUST_PROXY está vacío', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TRUST_PROXY', '');
    const { chunks, stream } = logLines();
    app({ logger: createLogger('info', stream) });
    const log = chunks.join('');
    expect(log).toContain('"level":40');
    expect(log).toContain('TRUST_PROXY');
  });

  it('B-4 RS-05: sin warn si TRUST_PROXY está definido o no es producción', () => {
    const { chunks, stream } = logLines();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TRUST_PROXY', '172.18.0.0/16');
    app({ logger: createLogger('info', stream) });
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('TRUST_PROXY', '');
    app({ logger: createLogger('info', stream) });
    expect(chunks.join('')).not.toContain('TRUST_PROXY');
  });
});
