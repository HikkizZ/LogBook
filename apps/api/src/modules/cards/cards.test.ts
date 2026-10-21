import request from 'supertest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { getDataSource } from '../../db/client.js';
import { app, client } from '../../test/helpers.js';
import type { TestClient } from '../../test/helpers.js';
import { branchName } from './branch.js';

afterEach(() => {
  vi.useRealTimers();
});

interface CardBody {
  id: string;
  ref: string;
  number: number;
  project: string;
  title: string;
  status: string;
  position: number;
  labels: { name: string; color: string }[];
  checklistDone: number;
  checklistTotal: number;
  archivedAt: string | null;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
}

async function newProject(api: TestClient, name: string): Promise<string> {
  const res = await api.post('/projects').send({ name, color: 'violeta' });
  expect(res.status).toBe(201);
  return res.body.slug as string;
}

async function newLabel(api: TestClient, name: string): Promise<void> {
  expect((await api.post('/labels').send({ name, color: 'gris' })).status).toBe(201);
}

async function newCard(api: TestClient, body: Record<string, unknown>): Promise<CardBody> {
  const res = await api.post('/cards').send(body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as CardBody;
}

/** Proyecto `alfa` + `beta` y las etiquetas `bug` y `feature`. */
async function setup() {
  const api = await client();
  await newProject(api, 'Alfa');
  await newProject(api, 'Beta');
  await newLabel(api, 'bug');
  await newLabel(api, 'feature');
  return api;
}

describe('RF-20 ref de tarjeta', () => {
  it('RF-20 T-1 y T-01 resuelven la misma tarjeta, y también su uuid', async () => {
    const api = await setup();
    const card = await newCard(api, { project: 'alfa', title: 'Primera' });
    expect(card.ref).toBe('T-1');
    const a = await api.get('/cards/T-1');
    const b = await api.get('/cards/T-01');
    const c = await api.get(`/cards/${card.id}`);
    expect(a.status).toBe(200);
    expect(b.body).toEqual(a.body);
    expect(c.body).toEqual(a.body);
  });

  it('RF-20 T-999 responde 404; T-0, un número fuera de rango y un uuid inexistente también', async () => {
    const api = await setup();
    for (const ref of ['T-999', 'T-0', 'T-99999999999', '0198a000-0000-7000-8000-000000000000']) {
      const res = await api.get(`/cards/${ref}`);
      expect(res.status, ref).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
  });

  it('RF-20 una ref mal formada responde 400', async () => {
    const api = await setup();
    for (const ref of ['t-1', 'T-', 'T-1a', 'abc', '42']) {
      expect((await api.get(`/cards/${ref}`)).status, ref).toBe(400);
    }
  });

  it('RF-20 el número sale de una secuencia global compartida por todos los proyectos', async () => {
    const api = await setup();
    const a = await newCard(api, { project: 'alfa', title: 'A' });
    const b = await newCard(api, { project: 'beta', title: 'B' });
    const c = await newCard(api, { project: 'alfa', title: 'C' });
    expect([a.number, b.number, c.number]).toEqual([1, 2, 3]);
    expect(b.ref).toBe('T-2');
  });
});

describe('RF-21 / RF-26 crear tarjeta', () => {
  it('RF-26 con solo proyecto y título crea la tarjeta con los valores por defecto', async () => {
    const api = await setup();
    const res = await api.post('/cards').send({ project: 'alfa', title: '  Tarjeta rápida  ' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      project: 'alfa',
      title: 'Tarjeta rápida',
      description: '',
      status: 'backlog',
      priority: 'medium',
      labels: [],
      position: 0,
      startDate: null,
      dueDate: null,
      completedAt: null,
      archivedAt: null,
      checklistDone: 0,
      checklistTotal: 0,
    });
  });

  it('RF-21 acepta todos los campos: descripción, prioridad, etiquetas (sin distinguir mayúsculas), fechas y checklist', async () => {
    const api = await setup();
    const card = await newCard(api, {
      project: 'alfa',
      title: 'Completa',
      description: '## Hola',
      priority: 'urgent',
      status: 'todo',
      labels: ['BUG', 'feature'],
      startDate: '2026-03-01',
      dueDate: '2026-03-10',
      checklist: ['uno', 'dos'],
    });
    expect(card).toMatchObject({
      description: '## Hola',
      priority: 'urgent',
      status: 'todo',
      startDate: '2026-03-01',
      dueDate: '2026-03-10',
      checklistTotal: 2,
      checklistDone: 0,
    });
    expect(card.labels).toEqual([
      { name: 'bug', color: 'gris' },
      { name: 'feature', color: 'gris' },
    ]);
    const detail = await api.get(`/cards/${card.ref}`);
    expect(
      detail.body.checklist.map((i: { text: string; position: number }) => [i.text, i.position]),
    ).toEqual([
      ['uno', 0],
      ['dos', 1],
    ]);
  });

  it('RF-21 rechaza con 400 título vacío o de más de 200, descripción de más de 20000, prioridad y fechas inválidas', async () => {
    const api = await setup();
    const base = { project: 'alfa', title: 'ok' };
    for (const extra of [
      { title: '' },
      { title: '   ' },
      { title: 'x'.repeat(201) },
      { description: 'x'.repeat(20001) },
      { priority: 'critica' },
      { status: 'archivada' },
      { dueDate: '2026-13-01' },
      { dueDate: '10/03/2026' },
      { startDate: '2026-03-10', dueDate: '2026-03-01' },
      { labels: [''] },
      { checklist: ['x'.repeat(301)] },
    ]) {
      const res = await api.post('/cards').send({ ...base, ...extra });
      expect(res.status, JSON.stringify(extra)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect((await api.post('/cards').send({ title: 'sin proyecto' })).status).toBe(400);
  });

  it('RF-21 título de 200 y descripción de 20000 caracteres son válidos', async () => {
    const api = await setup();
    await newCard(api, { project: 'alfa', title: 'x'.repeat(200), description: 'y'.repeat(20000) });
  });

  it('RF-23 una etiqueta inexistente responde 400 y no crea la tarjeta', async () => {
    const api = await setup();
    const res = await api.post('/cards').send({ project: 'alfa', title: 'x', labels: ['nope'] });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('labels');
    expect((await api.get('/cards')).body.items).toHaveLength(0);
  });

  it('RF-21 un proyecto inexistente responde 404 y uno archivado 409', async () => {
    const api = await setup();
    expect((await api.post('/cards').send({ project: 'nada', title: 'x' })).status).toBe(404);
    await api.post('/projects/beta/archive').send();
    expect((await api.post('/cards').send({ project: 'beta', title: 'x' })).status).toBe(409);
  });

  it('RF-11 position = último de la columna: cada estado cuenta por separado', async () => {
    const api = await setup();
    const a = await newCard(api, { project: 'alfa', title: 'a' });
    const b = await newCard(api, { project: 'alfa', title: 'b' });
    const c = await newCard(api, { project: 'alfa', title: 'c', status: 'todo' });
    const d = await newCard(api, { project: 'alfa', title: 'd' });
    const other = await newCard(api, { project: 'beta', title: 'e' });
    expect([a, b, c, d, other].map((x) => x.position)).toEqual([0, 1, 0, 2, 0]);
  });

  it('RF-11 creaciones simultáneas en la misma columna no repiten posición', async () => {
    const api = await setup();
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        api.post('/cards').send({ project: 'alfa', title: `c${i}` }),
      ),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    const positions = results.map((r) => (r.body as CardBody).position).sort((x, y) => x - y);
    expect(positions).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('RF-15 crear directamente en in_progress completa startDate y en done completa completedAt', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-05T12:00:00Z'));
    const api = await setup();
    const doing = await newCard(api, { project: 'alfa', title: 'a', status: 'in_progress' });
    expect(doing.startDate).toBe('2026-03-05');
    const done = await newCard(api, { project: 'alfa', title: 'b', status: 'done' });
    expect(done.completedAt).toBe('2026-03-05T12:00:00.000Z');
    const explicit = await newCard(api, {
      project: 'alfa',
      title: 'c',
      status: 'in_progress',
      startDate: '2026-03-01',
    });
    expect(explicit.startDate).toBe('2026-03-01');
  });
});

describe('RF-21 / RF-23 / RF-28 PATCH', () => {
  it('RF-21 PATCH con status responde 400 (para eso está move)', async () => {
    const api = await setup();
    const card = await newCard(api, { project: 'alfa', title: 'x' });
    const res = await api.patch(`/cards/${card.ref}`).send({ status: 'done' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect((await api.get(`/cards/${card.ref}`)).body.status).toBe('backlog');
  });

  it('RF-21 PATCH con campos desconocidos o de solo lectura (number, position) responde 400', async () => {
    const api = await setup();
    const card = await newCard(api, { project: 'alfa', title: 'x' });
    for (const body of [{ number: 9 }, { position: 3 }, { id: card.id }, { foo: 1 }]) {
      expect((await api.patch(`/cards/${card.ref}`).send(body)).status, JSON.stringify(body)).toBe(
        400,
      );
    }
  });

  it('RF-21 PATCH edita título, descripción, prioridad, etiquetas y fechas, y permite vaciar las fechas', async () => {
    const api = await setup();
    const card = await newCard(api, {
      project: 'alfa',
      title: 'x',
      labels: ['bug'],
      dueDate: '2026-04-01',
    });
    const res = await api.patch(`/cards/${card.ref}`).send({
      title: 'nuevo',
      description: 'desc',
      priority: 'high',
      labels: ['feature'],
      startDate: '2026-03-01',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      title: 'nuevo',
      description: 'desc',
      priority: 'high',
      startDate: '2026-03-01',
      dueDate: '2026-04-01',
      labels: [{ name: 'feature', color: 'gris' }],
    });
    const cleared = await api.patch(`/cards/${card.ref}`).send({ dueDate: null, labels: [] });
    expect(cleared.body).toMatchObject({ dueDate: null, labels: [] });
  });

  it('RF-21 PATCH deja sin tocar lo que no se envía', async () => {
    const api = await setup();
    const card = await newCard(api, {
      project: 'alfa',
      title: 'x',
      priority: 'low',
      labels: ['bug'],
    });
    const res = await api.patch(`/cards/${card.ref}`).send({ title: 'y' });
    expect(res.body).toMatchObject({ priority: 'low', labels: [{ name: 'bug', color: 'gris' }] });
  });

  it('RF-21 PATCH con dueDate anterior al startDate existente responde 400', async () => {
    const api = await setup();
    const card = await newCard(api, { project: 'alfa', title: 'x', startDate: '2026-03-10' });
    const res = await api.patch(`/cards/${card.ref}`).send({ dueDate: '2026-03-01' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('RF-23 PATCH con etiqueta inexistente responde 400 sin cambiar nada', async () => {
    const api = await setup();
    const card = await newCard(api, { project: 'alfa', title: 'x', labels: ['bug'] });
    const res = await api.patch(`/cards/${card.ref}`).send({ title: 'cambio', labels: ['nope'] });
    expect(res.status).toBe(400);
    const after = await api.get(`/cards/${card.ref}`);
    expect(after.body.title).toBe('x');
    expect(after.body.labels).toHaveLength(1);
  });

  it('RF-28 mover de proyecto conserva número, bitácora y checklist, y va al final de la misma columna', async () => {
    const api = await setup();
    const a1 = await newCard(api, { project: 'alfa', title: 'a1', status: 'todo' });
    const a2 = await newCard(api, {
      project: 'alfa',
      title: 'a2',
      status: 'todo',
      checklist: ['i1', 'i2'],
    });
    const a3 = await newCard(api, { project: 'alfa', title: 'a3', status: 'todo' });
    await newCard(api, { project: 'beta', title: 'b1', status: 'todo' });
    await getDataSource().query(
      `INSERT INTO log_entry (card_id, kind, source, body) VALUES ($1, 'note', 'ui', 'una nota')`,
      [a2.id],
    );

    const res = await api.patch(`/cards/${a2.ref}`).send({ project: 'beta' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ref: a2.ref,
      number: a2.number,
      project: 'beta',
      status: 'todo',
      position: 1,
      checklistTotal: 2,
    });
    const detail = await api.get(`/cards/${a2.ref}`);
    expect(detail.body.log.map((l: { body: string }) => l.body)).toEqual(['una nota']);
    expect(detail.body.checklist).toHaveLength(2);

    // La columna de origen queda compacta.
    const source = await api.get('/cards?project=alfa');
    expect(source.body.items.map((c: CardBody) => [c.ref, c.position])).toEqual([
      [a1.ref, 0],
      [a3.ref, 1],
    ]);
  });

  it('RF-28 mover a un proyecto inexistente da 404, a uno archivado 409 y al mismo proyecto no cambia nada', async () => {
    const api = await setup();
    const card = await newCard(api, { project: 'alfa', title: 'x' });
    expect((await api.patch(`/cards/${card.ref}`).send({ project: 'nada' })).status).toBe(404);
    await api.post('/projects/beta/archive').send();
    expect((await api.patch(`/cards/${card.ref}`).send({ project: 'beta' })).status).toBe(409);
    const same = await api.patch(`/cards/${card.ref}`).send({ project: 'alfa' });
    expect(same.status).toBe(200);
    expect(same.body).toMatchObject({ project: 'alfa', position: 0 });
  });
});

describe('RF-29 rama sugerida', () => {
  it('RF-29 fix/T-7-titulo-slug si tiene la etiqueta bug', async () => {
    const api = await setup();
    for (let i = 1; i <= 6; i++) await newCard(api, { project: 'alfa', title: `relleno ${i}` });
    const card = await newCard(api, { project: 'alfa', title: 'Título slug', labels: ['bug'] });
    expect(card.ref).toBe('T-7');
    const detail = await api.get('/cards/T-7');
    expect(detail.body.branchName).toBe('fix/T-7-titulo-slug');
  });

  it('RF-29 feat/ con otras etiquetas o sin ellas, y refleja cambios de título y etiquetas', async () => {
    const api = await setup();
    const card = await newCard(api, {
      project: 'alfa',
      title: 'Agregar filtro',
      labels: ['feature'],
    });
    expect((await api.get(`/cards/${card.ref}`)).body.branchName).toBe('feat/T-1-agregar-filtro');
    await api.patch(`/cards/${card.ref}`).send({ title: 'Arreglar ñandú', labels: ['Bug'] });
    expect((await api.get(`/cards/${card.ref}`)).body.branchName).toBe('fix/T-1-arreglar-nandu');
  });

  it('RF-29 branchName: sin slug usable queda fix/T-3; el slug se acota a 50 caracteres', () => {
    expect(branchName(3, '¡¡¡', ['bug'])).toBe('fix/T-3');
    const name = branchName(3, 'palabra '.repeat(20), []);
    expect(name.startsWith('feat/T-3-palabra-palabra')).toBe(true);
    expect(name.length).toBeLessThanOrEqual('feat/T-3-'.length + 50);
    expect(name.endsWith('-')).toBe(false);
  });
});

describe('§4.4 detalle de tarjeta', () => {
  it('RF-30 devuelve checklist ordenado y solo las últimas 50 entradas de bitácora, en orden cronológico', async () => {
    const api = await setup();
    const card = await newCard(api, { project: 'alfa', title: 'x', checklist: ['a', 'b', 'c'] });
    await getDataSource().query(
      `INSERT INTO log_entry (card_id, kind, source, body, occurred_at)
       SELECT $1, 'note', 'api', 'nota ' || g, '2026-03-01T00:00:00Z'::timestamptz + (g || ' minutes')::interval
       FROM generate_series(1, 55) AS g`,
      [card.id],
    );
    const res = await api.get(`/cards/${card.ref}`);
    expect(res.status).toBe(200);
    expect(res.body.checklist.map((i: { text: string }) => i.text)).toEqual(['a', 'b', 'c']);
    expect(res.body.log).toHaveLength(50);
    expect(res.body.log[0].body).toBe('nota 6');
    expect(res.body.log[49].body).toBe('nota 55');
    expect(Object.keys(res.body.log[0]).sort()).toEqual([
      'body',
      'cardRef',
      'createdAt',
      'id',
      'kind',
      'metadata',
      'occurredAt',
      'source',
    ]);
    expect(res.body.log[0].cardRef).toBe('T-1');
  });

  it('RF-24 checklistDone/checklistTotal salen en el detalle y en el listado', async () => {
    const api = await setup();
    const card = await newCard(api, { project: 'alfa', title: 'x', checklist: ['a', 'b', 'c'] });
    await getDataSource().query(
      `UPDATE checklist_item SET done = true WHERE card_id = $1 AND position < 2`,
      [card.id],
    );
    const list = await api.get('/cards');
    expect(list.body.items[0]).toMatchObject({ checklistDone: 2, checklistTotal: 3 });
    expect((await api.get(`/cards/${card.ref}`)).body).toMatchObject({
      checklistDone: 2,
      checklistTotal: 3,
    });
  });
});

describe('§4.4 GET /cards: filtros y cursor', () => {
  async function board() {
    const api = await setup();
    const c = async (project: string, title: string, extra: Record<string, unknown> = {}) =>
      newCard(api, { project, title, ...extra });
    await c('alfa', 'a-backlog');
    await c('alfa', 'a-doing', { status: 'in_progress', priority: 'high', labels: ['bug'] });
    await c('alfa', 'a-blocked', { status: 'blocked', dueDate: '2026-03-05' });
    await c('alfa', 'a-done', { status: 'done', labels: ['feature'], dueDate: '2026-04-01' });
    await c('beta', 'b-doing', { status: 'in_progress' });
    return api;
  }
  const titles = (res: { body: { items: CardBody[] } }) => res.body.items.map((x) => x.title);

  it('RF-10 ordena por (status, position) en el orden de las columnas', async () => {
    const api = await board();
    const res = await api.get('/cards?project=alfa');
    expect(titles(res)).toEqual(['a-backlog', 'a-doing', 'a-blocked', 'a-done']);
    expect(res.body.nextCursor).toBeNull();
  });

  it('RF-10 filtro status=in_progress,blocked', async () => {
    const api = await board();
    const res = await api.get('/cards?status=in_progress,blocked');
    expect(titles(res)).toEqual(['a-doing', 'b-doing', 'a-blocked']);
    expect(titles(await api.get('/cards?status=done'))).toEqual(['a-done']);
    expect((await api.get('/cards?status=in_progress,nope')).status).toBe(400);
  });

  it('RF-02 filtro por proyecto: el slug inexistente da 404', async () => {
    const api = await board();
    expect(titles(await api.get('/cards?project=beta'))).toEqual(['b-doing']);
    expect((await api.get('/cards?project=nada')).status).toBe(404);
  });

  it('RF-23 filtro por etiqueta (sin distinguir mayúsculas) y por prioridad', async () => {
    const api = await board();
    expect(titles(await api.get('/cards?label=BUG'))).toEqual(['a-doing']);
    expect(titles(await api.get('/cards?priority=high'))).toEqual(['a-doing']);
    expect(titles(await api.get('/cards?label=bug&priority=low'))).toEqual([]);
    expect((await api.get('/cards?priority=nope')).status).toBe(400);
  });

  it('RF-25 filtro due_before devuelve las que vencen antes de esa fecha', async () => {
    const api = await board();
    expect(titles(await api.get('/cards?due_before=2026-03-31'))).toEqual(['a-blocked']);
    expect(titles(await api.get('/cards?due_before=2026-04-02'))).toEqual(['a-blocked', 'a-done']);
    expect((await api.get('/cards?due_before=ayer')).status).toBe(400);
  });

  it('RF-27 las archivadas no salen por defecto; archived=true las incluye', async () => {
    const api = await board();
    await api.post('/cards/T-1/archive').send();
    expect(titles(await api.get('/cards?project=alfa'))).not.toContain('a-backlog');
    expect(titles(await api.get('/cards?project=alfa&archived=false'))).not.toContain('a-backlog');
    expect(titles(await api.get('/cards?project=alfa&archived=true'))).toContain('a-backlog');
  });

  it('§4.4 el cursor recorre todas las tarjetas sin repetir ni saltar', async () => {
    const api = await board();
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res = await api.get(`/cards?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
      expect(res.status).toBe(200);
      seen.push(...titles(res));
      cursor = res.body.nextCursor as string | null;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(seen).toEqual(titles(await api.get('/cards')));
    expect(new Set(seen).size).toBe(5);
  });

  it('§4.4 limit fuera de rango y cursor inválido responden 400', async () => {
    const api = await board();
    for (const q of [
      'limit=0',
      'limit=201',
      'limit=abc',
      'cursor=basura',
      `cursor=${Buffer.from('{"s":"x"}').toString('base64url')}`,
    ]) {
      expect((await api.get(`/cards?${q}`)).status, q).toBe(400);
    }
  });
});

describe('RF-27 archivar', () => {
  it('RF-27 archivar saca la tarjeta del tablero y compacta la columna; desarchivar la devuelve al final', async () => {
    const api = await setup();
    const a = await newCard(api, { project: 'alfa', title: 'a' });
    const b = await newCard(api, { project: 'alfa', title: 'b' });
    const c = await newCard(api, { project: 'alfa', title: 'c' });

    const archived = await api.post(`/cards/${b.ref}/archive`).send();
    expect(archived.status).toBe(200);
    expect(archived.body.archivedAt).toEqual(expect.any(String));
    const board = await api.get('/cards?project=alfa');
    expect(board.body.items.map((x: CardBody) => [x.ref, x.position])).toEqual([
      [a.ref, 0],
      [c.ref, 1],
    ]);
    // La archivada sigue accesible por ref.
    expect((await api.get(`/cards/${b.ref}`)).status).toBe(200);

    const back = await api.post(`/cards/${b.ref}/unarchive`).send();
    expect(back.body).toMatchObject({ archivedAt: null, position: 2 });
    const after = await api.get('/cards?project=alfa');
    expect(after.body.items.map((x: CardBody) => x.ref)).toEqual([a.ref, c.ref, b.ref]);
  });

  it('RF-27 archivar y desarchivar son idempotentes', async () => {
    const api = await setup();
    const a = await newCard(api, { project: 'alfa', title: 'a' });
    const first = await api.post(`/cards/${a.ref}/archive`).send();
    const second = await api.post(`/cards/${a.ref}/archive`).send();
    expect(second.body.archivedAt).toBe(first.body.archivedAt);
    await api.post(`/cards/${a.ref}/unarchive`).send();
    expect((await api.post(`/cards/${a.ref}/unarchive`).send()).body.archivedAt).toBeNull();
  });

  it('RF-27 los contadores de proyecto no cuentan las archivadas', async () => {
    const api = await setup();
    const a = await newCard(api, { project: 'alfa', title: 'a', status: 'todo' });
    await newCard(api, { project: 'alfa', title: 'b', status: 'todo' });
    await newCard(api, { project: 'alfa', title: 'c', status: 'review' });
    await api.post(`/cards/${a.ref}/archive`).send();
    const projects = (await api.get('/projects')).body as {
      slug: string;
      cardCounts: Record<string, number>;
    }[];
    expect(projects.find((p) => p.slug === 'alfa')?.cardCounts).toMatchObject({
      todo: 1,
      review: 1,
      backlog: 0,
    });
  });
});

describe('RF-20..29 autenticación', () => {
  it('las rutas de /cards exigen credencial', async () => {
    const application = app();
    for (const [method, path] of [
      ['get', '/cards'],
      ['post', '/cards'],
      ['get', '/cards/T-1'],
      ['patch', '/cards/T-1'],
      ['post', '/cards/T-1/archive'],
      ['post', '/cards/T-1/unarchive'],
    ] as const) {
      expect(
        (await request(application)[method](`/api/v1${path}`)).status,
        `${method} ${path}`,
      ).toBe(401);
    }
  });
});
