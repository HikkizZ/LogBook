import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CardDto, LogGroupsDto } from 'shared';
import { CSRF, app, client, login } from '../test/helpers.js';
import type { TestClient } from '../test/helpers.js';
import { renderSummary } from './summary/markdown.js';

// Tests de la tarea 2.11: cada uno cita en el nombre la decisión del 2026-10-21 que aplica.

afterEach(() => {
  vi.useRealTimers();
});

interface Detail {
  path: string;
  message: string;
}

async function project(api: TestClient, name: string, extra: object = {}) {
  const res = await api.post('/projects').send({ name, color: 'violeta', ...extra });
  expect(res.status).toBe(201);
  return res.body as { slug: string; wipLimit: number };
}

async function card(api: TestClient, slug: string, extra: object = {}): Promise<CardDto> {
  const res = await api.post('/cards').send({ project: slug, title: 'Tarjeta', ...extra });
  expect(res.status).toBe(201);
  return res.body as CardDto;
}

function paths(res: { body: { error: { details: Detail[] } } }): string[] {
  return res.body.error.details.map((d) => d.path);
}

describe('D2026-10-21 #13: el timezone de /settings manda sobre APP_TIMEZONE', () => {
  it('D2026-10-21 #13 con Asia/Tokyo una entrada de las 23:30 de Santiago cae en el día siguiente de GET /log', async () => {
    const api = await client();
    const { slug } = await project(api, 'Alfa');
    const { ref } = await card(api, slug);
    const note = { body: 'tarde', occurredAt: '2026-10-21T23:30:00-03:00' };
    expect((await api.post(`/cards/${ref}/log`).send(note)).status).toBe(201);

    const before = await api.get('/log?from=2026-10-21&to=2026-10-22');
    expect(before.body.days.map((d: { date: string }) => d.date)).toEqual(['2026-10-21']);

    expect((await api.patch('/settings').send({ timezone: 'Asia/Tokyo' })).status).toBe(200);
    const after = await api.get('/log?from=2026-10-21&to=2026-10-22');
    expect(after.body.days.map((d: { date: string }) => d.date)).toEqual(['2026-10-22']);
  });

  it('D2026-10-21 #13 "hoy" de /log, de /summary y de RF-15 es el del timezone de /settings', async () => {
    const api = await client();
    const { slug } = await project(api, 'Alfa');
    const { ref } = await card(api, slug, { status: 'todo' });
    await api.patch('/settings').send({ timezone: 'Asia/Tokyo' });

    // 20:00 UTC del 21: en Tokio ya es el 22 (05:00); en Santiago todavía es el 21 (17:00).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T20:00:00Z'));
    const moved = await api.post(`/cards/${ref}/move`).send({ status: 'in_progress' });
    expect(moved.status).toBe(200);
    expect(moved.body.startDate).toBe('2026-10-22');

    const log = await api.get('/log');
    expect(log.body.days.map((d: { date: string }) => d.date)).toEqual(['2026-10-22']);
    const summary = await api.get('/summary');
    expect(summary.text).toContain('## Día 2026-10-22');
  });
});

describe('D2026-10-21 #14: wipDefault es el WIP de los proyectos nuevos', () => {
  it('D2026-10-21 #14 sin wipLimit usa wipDefault; con wipLimit usa el indicado (también 0)', async () => {
    const api = await client();
    expect((await api.patch('/settings').send({ wipDefault: 5 })).status).toBe(200);
    expect((await project(api, 'Sin limite')).wipLimit).toBe(5);
    expect((await project(api, 'Con limite', { wipLimit: 2 })).wipLimit).toBe(2);
    expect((await project(api, 'Cero', { wipLimit: 0 })).wipLimit).toBe(0);
  });
});

describe('D2026-10-21 #15: tarjetas de un proyecto archivado son de solo lectura', () => {
  it('D2026-10-21 #15 move y PATCH de una tarjeta de un proyecto archivado dan 409; desarchivar vuelve a permitirlos', async () => {
    const api = await client();
    const alfa = await project(api, 'Alfa');
    await project(api, 'Beta');
    const { ref } = await card(api, alfa.slug, { status: 'todo' });
    expect((await api.post(`/projects/${alfa.slug}/archive`).send()).status).toBe(200);

    const move = await api.post(`/cards/${ref}/move`).send({ status: 'in_progress' });
    expect(move.status).toBe(409);
    expect(move.body.error.code).toBe('CONFLICT');
    const patch = await api.patch(`/cards/${ref}`).send({ title: 'Otro' });
    expect(patch.status).toBe(409);
    expect(patch.body.error.code).toBe('CONFLICT');
    const away = await api.patch(`/cards/${ref}`).send({ project: 'beta' });
    expect(away.status).toBe(409);

    const detail = await api.get(`/cards/${ref}`);
    expect(detail.body).toMatchObject({ status: 'todo', title: 'Tarjeta', project: alfa.slug });
    expect(detail.body.log).toEqual([]);

    expect((await api.post(`/projects/${alfa.slug}/unarchive`).send()).status).toBe(200);
    expect((await api.post(`/cards/${ref}/move`).send({ status: 'in_progress' })).status).toBe(200);
    expect((await api.patch(`/cards/${ref}`).send({ title: 'Otro' })).status).toBe(200);
  });
});

describe('D2026-10-21 #17: fechas de entrada entre 1970-01-01 y 2100-12-31', () => {
  it('D2026-10-21 #17 dueDate y startDate fuera de rango dan 400 con details[].path en POST y PATCH /cards', async () => {
    const api = await client();
    const { slug } = await project(api, 'Alfa');
    const { ref } = await card(api, slug);
    for (const bad of ['1969-12-31', '2101-01-01', '0000-01-01']) {
      const dueCreate = await api.post('/cards').send({ project: slug, title: 'x', dueDate: bad });
      expect(dueCreate.status).toBe(400);
      expect(paths(dueCreate)).toContain('dueDate');
      const startCreate = await api
        .post('/cards')
        .send({ project: slug, title: 'x', startDate: bad });
      expect(startCreate.status).toBe(400);
      expect(paths(startCreate)).toContain('startDate');
      const duePatch = await api.patch(`/cards/${ref}`).send({ dueDate: bad });
      expect(duePatch.status).toBe(400);
      expect(paths(duePatch)).toContain('dueDate');
      const startPatch = await api.patch(`/cards/${ref}`).send({ startDate: bad });
      expect(startPatch.status).toBe(400);
      expect(paths(startPatch)).toContain('startDate');
    }
  });

  it('D2026-10-21 #17 los límites 1970-01-01 y 2100-12-31 se aceptan', async () => {
    const api = await client();
    const { slug } = await project(api, 'Alfa');
    const created = await api
      .post('/cards')
      .send({ project: slug, title: 'x', startDate: '1970-01-01', dueDate: '2100-12-31' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ startDate: '1970-01-01', dueDate: '2100-12-31' });
  });

  it('D2026-10-21 #17 occurredAt fuera de rango da 400 en POST y PATCH de la bitácora; los límites se aceptan', async () => {
    const api = await client();
    const { slug } = await project(api, 'Alfa');
    const { ref } = await card(api, slug);
    const entry = await api.post(`/cards/${ref}/log`).send({ body: 'a' });
    const id = (entry.body as { id: string }).id;

    for (const bad of [
      '0000-01-01T00:00:00Z',
      '1969-12-31T23:59:59Z',
      '2101-01-01T00:00:00Z',
      '9999-12-31T00:00:00Z',
    ]) {
      const post = await api.post(`/cards/${ref}/log`).send({ body: 'a', occurredAt: bad });
      expect(post.status).toBe(400);
      expect(paths(post)).toContain('occurredAt');
      const patch = await api.patch(`/log/${id}`).send({ occurredAt: bad });
      expect(patch.status).toBe(400);
      expect(paths(patch)).toContain('occurredAt');
    }
    for (const ok of ['1970-01-01T00:00:00Z', '2100-12-31T23:59:59Z']) {
      const post = await api.post(`/cards/${ref}/log`).send({ body: 'a', occurredAt: ok });
      expect(post.status).toBe(201);
    }
  });

  it('D2026-10-21 #17 los filtros de fecha de GET /cards, /log y /summary fuera de rango dan 400', async () => {
    const api = await client();
    const cases: [string, string][] = [
      ['/cards?due_before=2101-01-01', 'due_before'],
      ['/cards?due_before=1969-12-31', 'due_before'],
      ['/log?from=1969-12-31', 'from'],
      ['/log?to=2101-01-01', 'to'],
      ['/summary?from=1969-12-31&to=1970-01-02', 'from'],
      ['/summary?to=2101-01-01', 'to'],
    ];
    for (const [url, field] of cases) {
      const res = await api.get(url);
      expect(res.status, url).toBe(400);
      expect(paths(res), url).toContain(field);
    }
    expect((await api.get('/cards?due_before=2100-12-31')).status).toBe(200);
    expect((await api.get('/log?from=1970-01-01&to=1970-01-01')).status).toBe(200);
    expect((await api.get('/log?from=2100-12-31&to=2100-12-31')).status).toBe(200);
  });
});

describe('D2026-10-21 #18: crear en blocked exige reason', () => {
  it('D2026-10-21 #18 POST /cards con status blocked sin reason (o demasiado corto) da 400 con path reason', async () => {
    const api = await client();
    const { slug } = await project(api, 'Alfa');
    for (const extra of [{}, { reason: '' }, { reason: 'ab' }, { reason: '   ' }]) {
      const res = await api
        .post('/cards')
        .send({ project: slug, title: 'x', status: 'blocked', ...extra });
      expect(res.status).toBe(400);
      expect(paths(res)).toContain('reason');
    }
    expect((await api.get('/cards')).body.items).toEqual([]);
  });

  it('D2026-10-21 #18 con reason crea la tarjeta y una entrada blocked con ese cuerpo, sin entrada moved', async () => {
    const api = await client();
    const { slug } = await project(api, 'Alfa');
    const created = await api
      .post('/cards')
      .send({ project: slug, title: 'x', status: 'blocked', reason: ' Espero al cliente ' });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('blocked');
    const log = await api.get(`/cards/${created.body.ref as string}/log`);
    expect(log.body).toHaveLength(1);
    expect(log.body[0]).toMatchObject({
      kind: 'blocked',
      body: 'Espero al cliente',
      source: 'api',
    });
  });

  it('D2026-10-21 #18 un reason con otro status se ignora y no escribe entradas', async () => {
    const api = await client();
    const { slug } = await project(api, 'Alfa');
    const created = await card(api, slug, { status: 'todo', reason: 'no aplica' });
    expect((await api.get(`/cards/${created.ref}/log`)).body).toEqual([]);
  });
});

describe('D2026-10-21 #19: escape en /summary', () => {
  it('D2026-10-21 #19 título de tarjeta y nombre de proyecto salen escapados; note y blocked quedan crudos', async () => {
    const api = await client();
    const { slug } = await project(api, 'x_y');
    const title = 'a [b](c) *d* `e`';
    const { ref } = await card(api, slug, { title });
    await api.post(`/cards/${ref}/log`).send({ body: 'una **negrita** y `codigo`' });
    await api.post(`/cards/${ref}/log`).send({ body: 'espero _a_ alguien', kind: 'blocked' });

    const res = await api.get('/summary');
    expect(res.status).toBe(200);
    expect(res.text).toContain('### x\\_y');
    expect(res.text).toContain('a \\[b\\]\\(c\\) \\*d\\* \\`e\\`');
    expect(res.text).not.toContain('[b](c)');
    expect(res.text).not.toContain('### x_y');
    expect(res.text).toContain('una **negrita** y `codigo`');
    expect(res.text).toContain('Bloqueado: espero _a_ alguien');
  });

  it('D2026-10-21 #19 las entradas commit y pr (v2) se escapan; note y blocked no', () => {
    const entry = (kind: 'commit' | 'pr' | 'note', body: string) => ({
      id: '00000000-0000-4000-8000-000000000001',
      cardRef: 'T-1',
      kind,
      source: kind === 'note' ? ('api' as const) : ('github' as const),
      body,
      occurredAt: '2026-10-21T12:00:00.000Z',
      metadata: {},
      createdAt: '2026-10-21T12:00:00.000Z',
    });
    const card: LogGroupsDto['days'][number]['projects'][number]['cards'][number]['card'] = {
      id: '00000000-0000-4000-8000-000000000002',
      ref: 'T-1',
      number: 1,
      project: 'p',
      title: 'Título',
      status: 'todo',
      priority: 'medium',
      labels: [],
      position: 0,
      startDate: null,
      dueDate: null,
      completedAt: null,
      archivedAt: null,
      checklistDone: 0,
      checklistTotal: 0,
      createdAt: '2026-10-21T12:00:00.000Z',
      updatedAt: '2026-10-21T12:00:00.000Z',
    };
    const log: LogGroupsDto = {
      days: [
        {
          date: '2026-10-21',
          projects: [
            {
              project: {
                id: '00000000-0000-4000-8000-000000000003',
                name: 'P',
                slug: 'p',
                color: 'violeta',
                githubRepo: null,
                wipLimit: 3,
                archivedAt: null,
                createdAt: '2026-10-21T12:00:00.000Z',
                updatedAt: '2026-10-21T12:00:00.000Z',
              },
              cards: [
                {
                  card,
                  entries: [
                    entry('commit', 'fix: [click](http://x) *ya*'),
                    entry('pr', '# Título <b>'),
                    entry('note', 'nota **cruda**'),
                  ],
                },
              ],
            },
          ],
        },
      ],
      moved: [],
    };
    const md = renderSummary({ from: '2026-10-21', to: '2026-10-21' }, log);
    expect(md).toContain('fix: \\[click\\]\\(http://x\\) \\*ya\\*');
    expect(md).toContain('# Título \\<b\\>');
    expect(md).toContain('nota **cruda**');
  });
});

describe('D2026-10-21 #20: el Card de GET /log no lleva description', () => {
  it('D2026-10-21 #20 GET /log y /summary?format=json omiten description en days[] pero no en moved[]', async () => {
    const api = await client();
    const { slug } = await project(api, 'Alfa');
    const { ref } = await card(api, slug, { status: 'todo', description: 'texto largo' });
    await api.post(`/cards/${ref}/log`).send({ body: 'nota' });
    await api.post(`/cards/${ref}/move`).send({ status: 'in_progress' });

    for (const url of ['/log', '/summary?format=json']) {
      const res = await api.get(url);
      expect(res.status, url).toBe(200);
      const cards = res.body.days.flatMap((d: { projects: { cards: { card: object }[] }[] }) =>
        d.projects.flatMap((p) => p.cards.map((c) => c.card)),
      ) as object[];
      expect(cards.length, url).toBeGreaterThan(0);
      for (const c of cards) expect(c, url).not.toHaveProperty('description');
      expect(res.body.moved[0], url).toMatchObject({ ref, description: 'texto largo' });
    }
  });
});

describe('D2026-10-21 #21: prefix de /tokens con lb_', () => {
  it('D2026-10-21 #21 POST y GET /tokens devuelven prefix con lb_, igual al de GET /me con ese token', async () => {
    const application = app();
    const cookie = await login(application);
    const created = await request(application)
      .post('/api/v1/tokens')
      .set(CSRF)
      .set('Cookie', cookie)
      .send({ name: 'Skill' });
    expect(created.status).toBe(201);
    const token = created.body.token as string;
    const prefix = created.body.prefix as string;
    expect(prefix).toMatch(/^lb_[A-Za-z0-9_-]{8}$/);
    expect(prefix).toBe(token.slice(0, 11));

    const list = await request(application).get('/api/v1/tokens').set('Cookie', cookie);
    expect(list.body[0].prefix).toBe(prefix);

    const me = await request(application).get('/api/v1/me').set('Authorization', `Bearer ${token}`);
    expect(me.body.prefix).toBe(prefix);
  });
});
