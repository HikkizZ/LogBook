import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDataSource } from '../../db/client.js';
import { CSRF, app, client, login } from '../../test/helpers.js';
import type { TestClient } from '../../test/helpers.js';

afterEach(() => {
  vi.useRealTimers();
});

interface CardBody {
  ref: string;
  status: string;
  position: number;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  updatedAt: string;
}

interface LogRow {
  kind: string;
  source: string;
  body: string;
  metadata: Record<string, unknown>;
  occurred_at: Date;
}

async function setup(wipLimit?: number) {
  const api = await client();
  expect(
    (
      await api
        .post('/projects')
        .send({ name: 'Alfa', color: 'violeta', ...(wipLimit !== undefined ? { wipLimit } : {}) })
    ).status,
  ).toBe(201);
  return api;
}

async function newCard(api: TestClient, title: string, status?: string): Promise<CardBody> {
  const res = await api
    .post('/cards')
    .send({ project: 'alfa', title, ...(status ? { status } : {}) });
  expect(res.status).toBe(201);
  return res.body as CardBody;
}

async function logOf(ref: string): Promise<LogRow[]> {
  return getDataSource().query<LogRow[]>(
    `SELECT l.kind, l.source, l.body, l.metadata, l.occurred_at
     FROM log_entry l JOIN card c ON c.id = l.card_id
     WHERE c.number = $1 ORDER BY l.occurred_at, l.id`,
    [Number(ref.slice(2))],
  );
}

/** Orden de refs por columna: `{ todo: ['T-1', ...], ... }`. */
async function columns(api: TestClient): Promise<Record<string, string[]>> {
  const res = await api.get('/cards?project=alfa');
  const out: Record<string, string[]> = {};
  for (const c of res.body.items as CardBody[]) (out[c.status] ??= []).push(c.ref);
  return out;
}

/** Cada columna activa debe tener posiciones exactamente 0..n-1. */
async function expectCompactColumns(): Promise<void> {
  const rows = await getDataSource().query<{ status: string; positions: number[] }[]>(
    `SELECT status, array_agg(position ORDER BY position) AS positions
     FROM card WHERE archived_at IS NULL GROUP BY project_id, status`,
  );
  for (const r of rows) {
    expect(r.positions, r.status).toEqual(r.positions.map((_, i) => i));
  }
}

describe('RF-14 mover a Bloqueado', () => {
  it('RF-14 sin reason responde 400 y la tarjeta no se mueve ni deja entradas', async () => {
    const api = await setup();
    const card = await newCard(api, 'x', 'todo');
    for (const body of [
      { status: 'blocked' },
      { status: 'blocked', reason: '' },
      { status: 'blocked', reason: 'ab' },
      { status: 'blocked', reason: '   ' },
    ]) {
      const res = await api.post(`/cards/${card.ref}/move`).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect((await api.get(`/cards/${card.ref}`)).body.status).toBe('todo');
    expect(await logOf(card.ref)).toHaveLength(0);
  });

  it('RF-14 con reason de 3 caracteres mueve y deja una entrada blocked con el motivo, además de la moved', async () => {
    const api = await setup();
    const card = await newCard(api, 'x', 'in_progress');
    const res = await api
      .post(`/cards/${card.ref}/move`)
      .send({ status: 'blocked', reason: ' API caída ' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'blocked', position: 0 });
    const log = await logOf(card.ref);
    expect(log.map((l) => [l.kind, l.body])).toEqual([
      ['moved', 'En curso → Bloqueado'],
      ['blocked', 'API caída'],
    ]);
  });

  it('RF-14 reordenar dentro de Bloqueado no pide reason', async () => {
    const api = await setup();
    const a = await newCard(api, 'a');
    const b = await newCard(api, 'b');
    await api.post(`/cards/${a.ref}/move`).send({ status: 'blocked', reason: 'motivo a' });
    await api.post(`/cards/${b.ref}/move`).send({ status: 'blocked', reason: 'motivo b' });
    const res = await api.post(`/cards/${b.ref}/move`).send({ status: 'blocked', position: 0 });
    expect(res.status).toBe(200);
    expect((await columns(api))['blocked']).toEqual([b.ref, a.ref]);
  });

  it('RF-14 un reason en un movimiento a otra columna es válido y no genera entrada blocked', async () => {
    const api = await setup();
    const card = await newCard(api, 'x');
    expect(
      (await api.post(`/cards/${card.ref}/move`).send({ status: 'todo', reason: 'nota' })).status,
    ).toBe(200);
    expect((await logOf(card.ref)).map((l) => l.kind)).toEqual(['moved']);
  });
});

describe('RF-15 fechas automáticas', () => {
  it('RF-15 entrar a En curso completa startDate con la fecha de hoy en APP_TIMEZONE si estaba vacía', async () => {
    // 02:00 UTC del 5 de marzo es todavía el 4 en America/Santiago (UTC-3).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-05T02:00:00Z'));
    const api = await setup();
    const card = await newCard(api, 'x', 'todo');
    const res = await api.post(`/cards/${card.ref}/move`).send({ status: 'in_progress' });
    expect(res.body.startDate).toBe('2026-03-04');
  });

  it('RF-15 no pisa un startDate existente', async () => {
    const api = await setup();
    const created = await api
      .post('/cards')
      .send({ project: 'alfa', title: 'x', startDate: '2026-01-02' });
    const res = await api.post(`/cards/${created.body.ref}/move`).send({ status: 'in_progress' });
    expect(res.body.startDate).toBe('2026-01-02');
  });

  it('RF-15 volver a En curso desde otra columna no cambia un startDate ya puesto', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-05T15:00:00Z'));
    const api = await setup();
    const card = await newCard(api, 'x', 'todo');
    await api.post(`/cards/${card.ref}/move`).send({ status: 'in_progress' });
    vi.setSystemTime(new Date('2026-03-09T15:00:00Z'));
    await api.post(`/cards/${card.ref}/move`).send({ status: 'review' });
    const back = await api.post(`/cards/${card.ref}/move`).send({ status: 'in_progress' });
    expect(back.body.startDate).toBe('2026-03-05');
  });

  it('RF-15 si la fecha límite ya pasó, no se completa startDate (respeta due_date >= start_date)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-05T15:00:00Z'));
    const api = await setup();
    const created = await api
      .post('/cards')
      .send({ project: 'alfa', title: 'x', dueDate: '2026-03-01' });
    const res = await api.post(`/cards/${created.body.ref}/move`).send({ status: 'in_progress' });
    expect(res.status).toBe(200);
    expect(res.body.startDate).toBeNull();
  });

  it('RF-15 mover a Hecho completa completedAt con el instante actual y salir de Hecho lo vacía', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-05T15:30:00Z'));
    const api = await setup();
    const card = await newCard(api, 'x', 'review');
    const done = await api.post(`/cards/${card.ref}/move`).send({ status: 'done' });
    expect(done.body.completedAt).toBe('2026-03-05T15:30:00.000Z');
    vi.setSystemTime(new Date('2026-03-06T10:00:00Z'));
    const same = await api.post(`/cards/${card.ref}/move`).send({ status: 'done', position: 0 });
    expect(same.body.completedAt).toBe('2026-03-05T15:30:00.000Z');
    const out = await api.post(`/cards/${card.ref}/move`).send({ status: 'review' });
    expect(out.body.completedAt).toBeNull();
  });
});

describe('RF-16 entrada moved', () => {
  it('RF-16 todo movimiento entre columnas crea una entrada moved con origen y destino', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-05T15:30:00Z'));
    const api = await setup();
    const card = await newCard(api, 'x', 'todo');
    await api.post(`/cards/${card.ref}/move`).send({ status: 'in_progress' });
    await api.post(`/cards/${card.ref}/move`).send({ status: 'done' });
    const log = await logOf(card.ref);
    expect(log.map((l) => [l.kind, l.body, l.metadata])).toEqual([
      ['moved', 'Por hacer → En curso', { from: 'todo', to: 'in_progress' }],
      ['moved', 'En curso → Hecho', { from: 'in_progress', to: 'done' }],
    ]);
    expect(log[0]?.occurred_at.toISOString()).toBe('2026-03-05T15:30:00.000Z');
  });

  it('RF-16 reordenar dentro de la misma columna no crea entrada', async () => {
    const api = await setup();
    const a = await newCard(api, 'a', 'todo');
    const b = await newCard(api, 'b', 'todo');
    const res = await api.post(`/cards/${b.ref}/move`).send({ status: 'todo', position: 0 });
    expect(res.status).toBe(200);
    expect(await logOf(a.ref)).toHaveLength(0);
    expect(await logOf(b.ref)).toHaveLength(0);
    expect((await columns(api))['todo']).toEqual([b.ref, a.ref]);
  });

  it('RF-16 source es api con Bearer y ui con cookie de sesión', async () => {
    const application = app();
    const api = await client(application);
    expect((await api.post('/projects').send({ name: 'Alfa', color: 'violeta' })).status).toBe(201);
    const a = await newCard(api, 'a');
    const b = await newCard(api, 'b');

    await api.post(`/cards/${a.ref}/move`).send({ status: 'blocked', reason: 'espero respuesta' });
    expect((await logOf(a.ref)).map((l) => [l.kind, l.source])).toEqual([
      ['moved', 'api'],
      ['blocked', 'api'],
    ]);

    const cookie = await login(application);
    const res = await request(application)
      .post(`/api/v1/cards/${b.ref}/move`)
      .set(CSRF)
      .set('Cookie', cookie)
      .send({ status: 'blocked', reason: 'espero respuesta' });
    expect(res.status).toBe(200);
    expect((await logOf(b.ref)).map((l) => [l.kind, l.source])).toEqual([
      ['moved', 'ui'],
      ['blocked', 'ui'],
    ]);
  });

  it('RS-10 mover con cookie sin header CSRF responde 403 y no cambia nada', async () => {
    const application = app();
    const api = await client(application);
    await api.post('/projects').send({ name: 'Alfa', color: 'violeta' });
    const card = await newCard(api, 'a');
    const cookie = await login(application);
    const res = await request(application)
      .post(`/api/v1/cards/${card.ref}/move`)
      .set('Cookie', cookie)
      .send({ status: 'todo' });
    expect(res.status).toBe(403);
    expect((await api.get(`/cards/${card.ref}`)).body.status).toBe('backlog');
  });
});

describe('RF-13 WIP', () => {
  it('RF-13 superar el límite WIP de En curso no devuelve error', async () => {
    const api = await setup(1);
    const cards = [await newCard(api, 'a'), await newCard(api, 'b'), await newCard(api, 'c')];
    for (const card of cards) {
      const res = await api.post(`/cards/${card.ref}/move`).send({ status: 'in_progress' });
      expect(res.status).toBe(200);
    }
    expect((await columns(api))['in_progress']).toHaveLength(3);
  });
});

describe('RF-11 posiciones', () => {
  it('RF-11 mover entre columnas renumera origen y destino sin huecos', async () => {
    const api = await setup();
    const [a, b, c] = [
      await newCard(api, 'a', 'todo'),
      await newCard(api, 'b', 'todo'),
      await newCard(api, 'c', 'todo'),
    ];
    const x = await newCard(api, 'x', 'in_progress');
    const y = await newCard(api, 'y', 'in_progress');

    const res = await api.post(`/cards/${b.ref}/move`).send({ status: 'in_progress', position: 1 });
    expect(res.body).toMatchObject({ status: 'in_progress', position: 1 });
    expect(await columns(api)).toEqual({
      todo: [a?.ref, c?.ref],
      in_progress: [x.ref, b?.ref, y.ref],
    });
    await expectCompactColumns();
  });

  it('RF-11 position omitida = al final; position mayor que el largo se acota al final', async () => {
    const api = await setup();
    const a = await newCard(api, 'a', 'review');
    const b = await newCard(api, 'b', 'todo');
    const c = await newCard(api, 'c', 'todo');
    expect((await api.post(`/cards/${b.ref}/move`).send({ status: 'review' })).body.position).toBe(
      1,
    );
    expect(
      (await api.post(`/cards/${c.ref}/move`).send({ status: 'review', position: 99 })).body
        .position,
    ).toBe(2);
    expect((await columns(api))['review']).toEqual([a.ref, b.ref, c.ref]);
    await expectCompactColumns();
  });

  it('RF-11 reordenar dentro de la columna (hacia arriba y hacia abajo)', async () => {
    const api = await setup();
    const [a, b, c, d] = [
      await newCard(api, 'a', 'todo'),
      await newCard(api, 'b', 'todo'),
      await newCard(api, 'c', 'todo'),
      await newCard(api, 'd', 'todo'),
    ];
    await api.post(`/cards/${a.ref}/move`).send({ status: 'todo', position: 2 });
    expect((await columns(api))['todo']).toEqual([b.ref, c.ref, a.ref, d.ref]);
    await api.post(`/cards/${d.ref}/move`).send({ status: 'todo', position: 0 });
    expect((await columns(api))['todo']).toEqual([d.ref, b.ref, c.ref, a.ref]);
    await api.post(`/cards/${d.ref}/move`).send({ status: 'todo' });
    expect((await columns(api))['todo']).toEqual([b.ref, c.ref, a.ref, d.ref]);
    await expectCompactColumns();
  });

  it('RF-11 dos movimientos seguidos dejan posiciones 0..n-1 sin huecos ni duplicados', async () => {
    const api = await setup();
    const cards = [];
    for (let i = 0; i < 5; i++) cards.push(await newCard(api, `c${i}`, 'todo'));
    await api.post(`/cards/${cards[0]?.ref}/move`).send({ status: 'in_progress' });
    await api.post(`/cards/${cards[1]?.ref}/move`).send({ status: 'in_progress', position: 0 });
    const cols = await columns(api);
    expect(cols['todo']).toHaveLength(3);
    expect(cols['in_progress']).toEqual([cards[1]?.ref, cards[0]?.ref]);
    await expectCompactColumns();
  });

  it('RF-11 movimientos simultáneos en las mismas columnas dejan posiciones 0..n-1 sin huecos ni duplicados', async () => {
    const api = await setup();
    const cards: CardBody[] = [];
    for (let i = 0; i < 8; i++) cards.push(await newCard(api, `c${i}`, 'todo'));
    const moves = cards.map((c, i) =>
      api.post(`/cards/${c.ref}/move`).send({
        status: ['todo', 'in_progress', 'review'][i % 3],
        ...(i % 2 === 0 ? { position: 0 } : {}),
      }),
    );
    const results = await Promise.all(moves);
    expect(results.map((r) => r.status)).toEqual(Array(8).fill(200));
    await expectCompactColumns();
    const cols = await columns(api);
    const all = Object.values(cols).flat();
    expect(all).toHaveLength(8);
    expect(new Set(all).size).toBe(8);
  });
});

describe('POST /cards/:ref/move validación', () => {
  it('estado inválido, position negativa o no entera, y body vacío responden 400', async () => {
    const api = await setup();
    const card = await newCard(api, 'x');
    for (const body of [
      {},
      { status: 'archivada' },
      { status: 'todo', position: -1 },
      { status: 'todo', position: 1.5 },
      { status: 'todo', position: '1' },
    ]) {
      expect(
        (await api.post(`/cards/${card.ref}/move`).send(body)).status,
        JSON.stringify(body),
      ).toBe(400);
    }
  });

  it('una ref inexistente responde 404 y una tarjeta archivada 409', async () => {
    const api = await setup();
    expect((await api.post('/cards/T-99/move').send({ status: 'todo' })).status).toBe(404);
    const card = await newCard(api, 'x');
    await api.post(`/cards/${card.ref}/archive`).send();
    const res = await api.post(`/cards/${card.ref}/move`).send({ status: 'todo' });
    expect(res.status).toBe(409);
  });

  it('exige credencial', async () => {
    expect(
      (await request(app()).post('/api/v1/cards/T-1/move').send({ status: 'todo' })).status,
    ).toBe(401);
  });

  it('mover no toca otros campos de la tarjeta', async () => {
    const api = await setup();
    await api.post('/labels').send({ name: 'bug', color: 'gris' });
    const created = await api.post('/cards').send({
      project: 'alfa',
      title: 'x',
      description: 'd',
      priority: 'high',
      labels: ['bug'],
      checklist: ['a'],
    });
    const res = await api.post(`/cards/${created.body.ref}/move`).send({ status: 'review' });
    expect(res.body).toMatchObject({
      title: 'x',
      description: 'd',
      priority: 'high',
      labels: [{ name: 'bug', color: 'gris' }],
      checklistTotal: 1,
      number: created.body.number,
    });
  });
});
