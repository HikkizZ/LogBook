import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CSRF, app, client, login } from '../../test/helpers.js';
import type { TestClient } from '../../test/helpers.js';

afterEach(() => {
  vi.useRealTimers();
});

interface Entry {
  id: string;
  cardRef: string;
  kind: string;
  source: string;
  body: string;
  occurredAt: string;
}

async function newProject(api: TestClient, name: string): Promise<string> {
  const res = await api.post('/projects').send({ name, color: 'violeta' });
  expect(res.status).toBe(201);
  return (res.body as { slug: string }).slug;
}

async function newCard(api: TestClient, project: string, title: string, status = 'todo') {
  const res = await api.post('/cards').send({ project, title, status });
  expect(res.status).toBe(201);
  return (res.body as { ref: string }).ref;
}

async function note(
  api: TestClient,
  ref: string,
  body: string,
  occurredAt?: string,
  kind?: string,
) {
  const res = await api
    .post(`/cards/${ref}/log`)
    .send({ body, ...(occurredAt ? { occurredAt } : {}), ...(kind ? { kind } : {}) });
  expect(res.status).toBe(201);
  return res.body as Entry;
}

async function setup() {
  const api = await client();
  const slug = await newProject(api, 'Alfa');
  return { api, ref: await newCard(api, slug, 'Tarjeta') };
}

describe('bitácora de una tarjeta (RF-30..32)', () => {
  it('RF-30 crea una nota por defecto con source api (Bearer) y occurredAt = ahora', async () => {
    const { api, ref } = await setup();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T15:00:00Z'));
    const entry = await note(api, ref, 'Avancé X');
    expect(entry).toMatchObject({
      cardRef: ref,
      kind: 'note',
      source: 'api',
      body: 'Avancé X',
      occurredAt: '2026-10-21T15:00:00.000Z',
    });
  });

  it('RF-30 con cookie de sesión el source es ui y kind=blocked se acepta', async () => {
    const application = app();
    const api = await client(application);
    const slug = await newProject(api, 'Alfa');
    const ref = await newCard(api, slug, 'T');
    const cookie = await login(application);
    const res = await request(application)
      .post(`/api/v1/cards/${ref}/log`)
      .set(CSRF)
      .set('Cookie', cookie)
      .send({ body: 'trabado', kind: 'blocked' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ kind: 'blocked', source: 'ui' });
  });

  it('RF-30 occurredAt editable: registrar algo de ayer', async () => {
    const { api, ref } = await setup();
    const entry = await note(api, ref, 'ayer', '2026-10-20T18:00:00-03:00');
    expect(entry.occurredAt).toBe('2026-10-20T21:00:00.000Z');
  });

  it('RF-30 valida cuerpo (vacío, > 5000), kind de sistema y fecha mal formada', async () => {
    const { api, ref } = await setup();
    const post = (b: object) => api.post(`/cards/${ref}/log`).send(b);
    expect((await post({ body: '  ' })).status).toBe(400);
    expect((await post({ body: 'x'.repeat(5001) })).status).toBe(400);
    expect((await post({ body: 'x', kind: 'moved' })).status).toBe(400);
    expect((await post({ body: 'x', occurredAt: 'ayer' })).status).toBe(400);
    expect((await api.post('/cards/T-999/log').send({ body: 'x' })).status).toBe(404);
  });

  it('RF-30 GET /cards/:ref/log es cronológico, filtra por kinds y limit toma las últimas', async () => {
    const { api, ref } = await setup();
    await note(api, ref, 'tercera', '2026-10-21T12:00:00Z');
    await note(api, ref, 'primera', '2026-10-19T12:00:00Z');
    await note(api, ref, 'bloqueo', '2026-10-20T12:00:00Z', 'blocked');
    const all = (await api.get(`/cards/${ref}/log`)).body as Entry[];
    expect(all.map((e) => e.body)).toEqual(['primera', 'bloqueo', 'tercera']);
    const blocked = (await api.get(`/cards/${ref}/log?kinds=blocked`)).body as Entry[];
    expect(blocked.map((e) => e.body)).toEqual(['bloqueo']);
    const last = (await api.get(`/cards/${ref}/log?limit=2`)).body as Entry[];
    expect(last.map((e) => e.body)).toEqual(['bloqueo', 'tercera']);
    expect((await api.get(`/cards/${ref}/log?kinds=otro`)).status).toBe(400);
  });

  it('RF-32 editar una nota cambia body y occurredAt', async () => {
    const { api, ref } = await setup();
    const entry = await note(api, ref, 'viejo');
    const res = await api
      .patch(`/log/${entry.id}`)
      .send({ body: 'nuevo', occurredAt: '2026-10-20T10:00:00Z' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: entry.id,
      body: 'nuevo',
      occurredAt: '2026-10-20T10:00:00.000Z',
    });
  });

  it('RF-32 editar una entrada moved responde 400 y no la cambia; borrarla sí se puede', async () => {
    const { api, ref } = await setup();
    expect((await api.post(`/cards/${ref}/move`).send({ status: 'in_progress' })).status).toBe(200);
    const [moved] = (await api.get(`/cards/${ref}/log`)).body as Entry[];
    expect(moved?.kind).toBe('moved');

    const res = await api.patch(`/log/${moved?.id}`).send({ body: 'x' });
    expect(res.status).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
    expect(((await api.get(`/cards/${ref}/log`)).body as Entry[])[0]?.body).toBe(moved?.body);

    expect((await api.delete(`/log/${moved?.id}`)).status).toBe(204);
    expect((await api.get(`/cards/${ref}/log`)).body).toEqual([]);
  });

  it('RF-32 PATCH /log/:id rechaza campos ajenos y ids inexistentes; DELETE es 204 y luego 404', async () => {
    const { api, ref } = await setup();
    const entry = await note(api, ref, 'n');
    expect((await api.patch(`/log/${entry.id}`).send({ kind: 'blocked' })).status).toBe(400);
    expect((await api.patch('/log/no-uuid').send({ body: 'x' })).status).toBe(400);
    expect((await api.delete(`/log/${entry.id}`)).status).toBe(204);
    expect((await api.delete(`/log/${entry.id}`)).status).toBe(404);
    expect(
      (await api.patch('/log/0198a000-0000-7000-8000-000000000000').send({ body: 'x' })).status,
    ).toBe(404);
  });

  it('RF-30 sin credencial responde 401', async () => {
    const res = await request(app()).get('/api/v1/log');
    expect(res.status).toBe(401);
  });
});
