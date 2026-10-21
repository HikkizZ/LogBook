import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, client, CSRF, login } from '../test/helpers.js';

interface Body {
  error: { code: string; details?: { path: string; message: string }[] };
}

const NUL = '\u0000';

async function setup() {
  const api = await client();
  expect((await api.post('/projects').send({ name: 'Alfa', color: 'violeta' })).status).toBe(201);
  const card = await api.post('/cards').send({ project: 'alfa', title: 'Tarjeta' });
  expect(card.status).toBe(201);
  const ref = (card.body as { ref: string }).ref;
  const entry = await api.post(`/cards/${ref}/log`).send({ body: 'nota' });
  expect(entry.status).toBe(201);
  const item = await api.post(`/cards/${ref}/checklist`).send({ text: 'paso' });
  expect(item.status).toBe(201);
  const label = await api.post('/labels').send({ name: 'bug', color: 'gris' });
  expect(label.status).toBe(201);
  return {
    api,
    ref,
    entryId: (entry.body as { id: string }).id,
    itemId: (item.body as { id: string }).id,
    labelId: (label.body as { id: string }).id,
  };
}

describe('B-1 RS-07 un carácter NUL en cualquier texto responde 400 VALIDATION_ERROR', () => {
  it('B-1 RS-07: tarjetas (título, descripción, etiquetas, checklist inicial) y sus filtros', async () => {
    const { api, ref } = await setup();
    const cases: [string, () => request.Test, string][] = [
      ['title', () => api.post('/cards').send({ project: 'alfa', title: `a${NUL}b` }), 'title'],
      [
        'description',
        () => api.post('/cards').send({ project: 'alfa', title: 'x', description: `a${NUL}` }),
        'description',
      ],
      [
        'labels',
        () => api.post('/cards').send({ project: 'alfa', title: 'x', labels: [`a${NUL}`] }),
        'labels.0',
      ],
      [
        'checklist',
        () => api.post('/cards').send({ project: 'alfa', title: 'x', checklist: [`a${NUL}`] }),
        'checklist.0',
      ],
      ['patch title', () => api.patch(`/cards/${ref}`).send({ title: `a${NUL}` }), 'title'],
      [
        'patch description',
        () => api.patch(`/cards/${ref}`).send({ description: `${NUL}` }),
        'description',
      ],
      [
        'move reason',
        () => api.post(`/cards/${ref}/move`).send({ status: 'blocked', reason: `abc${NUL}` }),
        'reason',
      ],
      ['filtro label', () => api.get(`/cards?label=${encodeURIComponent(`a${NUL}`)}`), 'label'],
    ];
    for (const [name, send, path] of cases) {
      const res = await send();
      expect(res.status, name).toBe(400);
      const body = res.body as Body;
      expect(body.error.code, name).toBe('VALIDATION_ERROR');
      expect(body.error.details?.[0]?.path, name).toBe(path);
    }
  });

  it('B-1 RS-07: bitácora, checklist, etiquetas, proyectos y búsqueda', async () => {
    const { api, ref, entryId, itemId, labelId } = await setup();
    const cases: [string, () => request.Test][] = [
      ['log body', () => api.post(`/cards/${ref}/log`).send({ body: `x${NUL}` })],
      ['log patch', () => api.patch(`/log/${entryId}`).send({ body: `x${NUL}` })],
      ['checklist post', () => api.post(`/cards/${ref}/checklist`).send({ text: `x${NUL}` })],
      ['checklist patch', () => api.patch(`/checklist/${itemId}`).send({ text: `x${NUL}` })],
      ['label post', () => api.post('/labels').send({ name: `x${NUL}y`, color: 'gris' })],
      ['label patch', () => api.patch(`/labels/${labelId}`).send({ name: `x${NUL}` })],
      ['project post', () => api.post('/projects').send({ name: `P${NUL}`, color: 'violeta' })],
      ['project patch', () => api.patch('/projects/alfa').send({ name: `P${NUL}` })],
      ['search q', () => api.get('/search?q=abc%00')],
    ];
    for (const [name, send] of cases) {
      const res = await send();
      expect(res.status, name).toBe(400);
      expect((res.body as Body).error.code, name).toBe('VALIDATION_ERROR');
    }
  });

  it('B-1 RS-07: el nombre de un token', async () => {
    const application = app();
    const cookie = await login(application);
    const res = await request(application)
      .post('/api/v1/tokens')
      .set(CSRF)
      .set('Cookie', cookie)
      .send({ name: `t${NUL}` });
    expect(res.status).toBe(400);
    expect((res.body as Body).error.code).toBe('VALIDATION_ERROR');
  });
});
