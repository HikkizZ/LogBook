import { afterEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../test/helpers.js';
import type { TestClient } from '../../test/helpers.js';

afterEach(() => {
  vi.useRealTimers();
});

interface Entry {
  body: string;
}

interface Groups {
  days: {
    date: string;
    projects: {
      project: { slug: string; name: string };
      cards: { card: { ref: string }; entries: Entry[] }[];
    }[];
  }[];
  moved: { ref: string }[];
}

async function newProject(api: TestClient, name: string): Promise<string> {
  const res = await api.post('/projects').send({ name, color: 'violeta' });
  expect(res.status).toBe(201);
  return (res.body as { slug: string }).slug;
}

async function newCard(api: TestClient, project: string, title: string) {
  const res = await api.post('/cards').send({ project, title, status: 'todo' });
  expect(res.status).toBe(201);
  return (res.body as { ref: string }).ref;
}

async function note(
  api: TestClient,
  ref: string,
  body: string,
  occurredAt: string,
  kind?: string,
): Promise<void> {
  const res = await api
    .post(`/cards/${ref}/log`)
    .send({ body, occurredAt, ...(kind ? { kind } : {}) });
  expect(res.status).toBe(201);
}

async function setup() {
  const api = await client();
  const slug = await newProject(api, 'Alfa');
  return { api, slug, ref: await newCard(api, slug, 'Tarjeta') };
}

const bodiesOf = (g: Groups) => g.days[0]?.projects[0]?.cards[0]?.entries.map((e) => e.body);

describe('bitácora agregada GET /log (RF-40..42)', () => {
  it('RF-40 una entrada a las 23:30 de Santiago cae en ese día y no en el siguiente (UTC)', async () => {
    const { api, ref } = await setup();
    // 23:30 -03:00 del 20 = 02:30 UTC del 21.
    await note(api, ref, 'tarde', '2026-10-20T23:30:00-03:00');
    await note(api, ref, 'madrugada', '2026-10-21T00:10:00-03:00');

    const day20 = (await api.get('/log?from=2026-10-20&to=2026-10-20')).body as Groups;
    expect(day20.days.map((d) => d.date)).toEqual(['2026-10-20']);
    expect(bodiesOf(day20)).toEqual(['tarde']);

    const day21 = (await api.get('/log?from=2026-10-21&to=2026-10-21')).body as Groups;
    expect(bodiesOf(day21)).toEqual(['madrugada']);
  });

  it('RF-40 sin from/to devuelve hoy en APP_TIMEZONE; solo from = ese día', async () => {
    const { api, ref } = await setup();
    await note(api, ref, 'hoy', '2026-10-21T10:00:00-03:00');
    await note(api, ref, 'otro día', '2026-10-22T10:00:00-03:00');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T15:00:00Z'));
    const today = (await api.get('/log')).body as Groups;
    expect(today.days.map((d) => d.date)).toEqual(['2026-10-21']);
    const from = (await api.get('/log?from=2026-10-22')).body as Groups;
    expect(from.days.map((d) => d.date)).toEqual(['2026-10-22']);
    // 02:30 UTC del 21 todavía es el 20 en Santiago.
    vi.setSystemTime(new Date('2026-10-21T02:30:00Z'));
    expect(((await api.get('/log')).body as Groups).days).toEqual([]);
  });

  it('RF-40 agrupa por día, proyecto y tarjeta con tres proyectos', async () => {
    const api = await client();
    const zeta = await newProject(api, 'Zeta');
    const alfa = await newProject(api, 'Alfa');
    const medio = await newProject(api, 'Medio');
    const z1 = await newCard(api, zeta, 'Z1');
    const a1 = await newCard(api, alfa, 'A1');
    const a2 = await newCard(api, alfa, 'A2');
    const m1 = await newCard(api, medio, 'M1');

    await note(api, z1, 'z lunes', '2026-10-19T09:00:00-03:00');
    await note(api, a2, 'a2 lunes', '2026-10-19T10:00:00-03:00');
    await note(api, a1, 'a1 lunes 1', '2026-10-19T11:00:00-03:00');
    await note(api, a2, 'a2 lunes 2', '2026-10-19T12:00:00-03:00');
    await note(api, m1, 'm martes', '2026-10-20T09:00:00-03:00');
    await note(api, a1, 'a1 martes', '2026-10-20T10:00:00-03:00');
    await note(api, m1, 'fuera de rango', '2026-10-27T09:00:00-03:00');

    const log = (await api.get('/log?from=2026-10-19&to=2026-10-25')).body as Groups;
    const shape = log.days.map((d) => [
      d.date,
      d.projects.map((p) => [
        p.project.name,
        p.cards.map((c) => [c.card.ref, c.entries.map((e) => e.body)]),
      ]),
    ]);
    expect(shape).toEqual([
      [
        '2026-10-19',
        [
          [
            'Alfa',
            [
              [a2, ['a2 lunes', 'a2 lunes 2']],
              [a1, ['a1 lunes 1']],
            ],
          ],
          ['Zeta', [[z1, ['z lunes']]]],
        ],
      ],
      [
        '2026-10-20',
        [
          ['Alfa', [[a1, ['a1 martes']]]],
          ['Medio', [[m1, ['m martes']]]],
        ],
      ],
    ]);

    const onlyAlfa = (await api.get('/log?from=2026-10-19&to=2026-10-25&project=alfa'))
      .body as Groups;
    expect(onlyAlfa.days.flatMap((d) => d.projects.map((p) => p.project.slug))).toEqual([
      'alfa',
      'alfa',
    ]);
    expect((await api.get('/log?project=no-existe')).status).toBe(404);
  });

  it('RF-42 moved lista las tarjetas que cambiaron de columna en el período, aunque no tengan notas', async () => {
    const { api, slug, ref } = await setup();
    const quiet = await newCard(api, slug, 'Sin movimiento');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T15:00:00Z'));
    expect((await api.post(`/cards/${ref}/move`).send({ status: 'in_progress' })).status).toBe(200);
    vi.setSystemTime(new Date('2026-10-28T15:00:00Z'));
    expect((await api.post(`/cards/${quiet}/move`).send({ status: 'done' })).status).toBe(200);

    const log = (await api.get('/log?from=2026-10-19&to=2026-10-25')).body as Groups;
    expect(log.moved.map((c) => c.ref)).toEqual([ref]);
    // `moved` no depende de `kinds`.
    const onlyNotes = (await api.get('/log?from=2026-10-19&to=2026-10-25&kinds=note'))
      .body as Groups;
    expect(onlyNotes.days).toEqual([]);
    expect(onlyNotes.moved.map((c) => c.ref)).toEqual([ref]);
  });

  it('RF-40 kinds filtra las entradas y las archivadas siguen apareciendo (RF-27)', async () => {
    const { api, ref } = await setup();
    await note(api, ref, 'una nota', '2026-10-21T10:00:00-03:00');
    await note(api, ref, 'un bloqueo', '2026-10-21T11:00:00-03:00', 'blocked');
    await api.post(`/cards/${ref}/archive`);
    const q = '/log?from=2026-10-21&to=2026-10-21';
    expect(bodiesOf((await api.get(q)).body as Groups)).toEqual(['una nota', 'un bloqueo']);
    expect(bodiesOf((await api.get(`${q}&kinds=blocked`)).body as Groups)).toEqual(['un bloqueo']);
  });

  it('RF-40 valida el período: from > to, más de 366 días, fecha inválida', async () => {
    const { api } = await setup();
    expect((await api.get('/log?from=2026-10-25&to=2026-10-19')).status).toBe(400);
    expect((await api.get('/log?from=2024-01-01&to=2026-01-01')).status).toBe(400);
    expect((await api.get('/log?from=ayer')).status).toBe(400);
    expect((await api.get('/log?kinds=nota')).status).toBe(400);
  });
});
