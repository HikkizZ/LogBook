import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CSRF, app, login, newBearer } from '../test/helpers.js';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-03-01T10:00:00.000Z');
const TOKENS = '/api/v1/tokens';
const ME = '/api/v1/me';

afterEach(() => {
  vi.useRealTimers();
});

describe('RS-01 / RS-03 POST /tokens', () => {
  it('RS-01 crear devuelve el token una vez y expiresAt = ahora + 90 d', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    const application = app();
    const cookie = await login(application);
    const res = await request(application)
      .post(TOKENS)
      .set(CSRF)
      .set('Cookie', cookie)
      .send({ name: 'Claude Code PC' });
    expect(res.status).toBe(201);
    expect(res.body.token).toMatch(/^lb_[A-Za-z0-9_-]{8}\.[A-Za-z0-9_-]{43}$/);
    expect(res.body.name).toBe('Claude Code PC');
    expect(res.body.prefix).toBe(res.body.token.slice(3, 11));
    expect(res.body.expiresAt).toBe(new Date(T0.getTime() + 90 * DAY).toISOString());
    expect(Object.keys(res.body).sort()).toEqual(['expiresAt', 'id', 'name', 'prefix', 'token']);
  });

  it('RS-07 nombre vacío o de más de 80 caracteres responde 400', async () => {
    const application = app();
    const cookie = await login(application);
    for (const name of ['', '  ', 'a'.repeat(81)]) {
      const res = await request(application)
        .post(TOKENS)
        .set(CSRF)
        .set('Cookie', cookie)
        .send({ name });
      expect(res.status).toBe(400);
    }
  });

  it('RS-10 crear con cookie sin header CSRF responde 403', async () => {
    const application = app();
    const cookie = await login(application);
    const res = await request(application).post(TOKENS).set('Cookie', cookie).send({ name: 'x' });
    expect(res.status).toBe(403);
  });

  it('RS-01 el token creado sirve en /me como Bearer', async () => {
    const application = app();
    const cookie = await login(application);
    const created = await request(application)
      .post(TOKENS)
      .set(CSRF)
      .set('Cookie', cookie)
      .send({ name: 'Skill' });
    const me = await request(application)
      .get(ME)
      .set('Authorization', `Bearer ${created.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.auth).toBe('token');
    expect(me.body.name).toBe('Skill');
  });
});

describe('RS-01 GET /tokens', () => {
  it('RS-01 listar no devuelve hash ni token y sí expiresAt', async () => {
    const application = app();
    const cookie = await login(application);
    const created = await request(application)
      .post(TOKENS)
      .set(CSRF)
      .set('Cookie', cookie)
      .send({ name: 'Uno' });
    const res = await request(application).get(TOKENS).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(Object.keys(res.body[0]).sort()).toEqual([
      'createdAt',
      'expiresAt',
      'id',
      'lastUsedAt',
      'name',
      'prefix',
      'revokedAt',
    ]);
    expect(res.body[0].revokedAt).toBeNull();
    expect(typeof res.body[0].expiresAt).toBe('string');
    expect(res.text).not.toContain(created.body.token);
    expect(res.text).not.toMatch(/hash/i);
  });
});

describe('RS-03 DELETE /tokens/:id', () => {
  it('RS-03 revocar: 204, el token da 401 en /me y la fila sigue con revokedAt', async () => {
    const application = app();
    const cookie = await login(application);
    const created = await request(application)
      .post(TOKENS)
      .set(CSRF)
      .set('Cookie', cookie)
      .send({ name: 'Borrar' });
    const bearer = `Bearer ${created.body.token}`;
    expect((await request(application).get(ME).set('Authorization', bearer)).status).toBe(200);

    const del = await request(application)
      .delete(`${TOKENS}/${created.body.id}`)
      .set(CSRF)
      .set('Cookie', cookie);
    expect(del.status).toBe(204);
    expect((await request(application).get(ME).set('Authorization', bearer)).status).toBe(401);

    const list = await request(application).get(TOKENS).set('Cookie', cookie);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].revokedAt).not.toBeNull();
  });

  it('RS-03 un id inexistente responde 404 y uno que no es uuid responde 400', async () => {
    const application = app();
    const cookie = await login(application);
    const missing = await request(application)
      .delete(`${TOKENS}/019a0000-0000-7000-8000-000000000000`)
      .set(CSRF)
      .set('Cookie', cookie);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
    const bad = await request(application).delete(`${TOKENS}/abc`).set(CSRF).set('Cookie', cookie);
    expect(bad.status).toBe(400);
  });
});

describe('RS-03 /tokens solo con cookie', () => {
  it('RS-03 POST, GET y DELETE con Bearer responden 403 FORBIDDEN', async () => {
    const application = app();
    const bearer = await newBearer();
    const calls = [
      request(application).post(TOKENS).send({ name: 'x' }),
      request(application).get(TOKENS),
      request(application).delete(`${TOKENS}/019a0000-0000-7000-8000-000000000000`),
    ];
    for (const call of calls) {
      const res = await call.set('Authorization', bearer);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('RS-03 sin credencial responden 401', async () => {
    const res = await request(app()).get(TOKENS);
    expect(res.status).toBe(401);
  });
});

describe('RS-01 vencimiento del token creado', () => {
  it('RS-01 con el reloj en + 90 d + 1 s el token responde 401 en /me, y en + 90 d - 1 s 200', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    const application = app();
    const cookie = await login(application);
    const created = await request(application)
      .post(TOKENS)
      .set(CSRF)
      .set('Cookie', cookie)
      .send({ name: 'Vence' });
    const bearer = `Bearer ${created.body.token}`;

    vi.setSystemTime(T0.getTime() + 90 * DAY - 1000);
    expect((await request(application).get(ME).set('Authorization', bearer)).status).toBe(200);
    vi.setSystemTime(T0.getTime() + 90 * DAY + 1000);
    expect((await request(application).get(ME).set('Authorization', bearer)).status).toBe(401);
  });
});
