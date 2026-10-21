import { afterEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../test/helpers.js';
import type { TestClient } from '../../test/helpers.js';

afterEach(() => {
  vi.useRealTimers();
});

/** 3 proyectos, 5 tarjetas, notas, un bloqueo y movimientos; semana 43 de 2026 (lunes 19 a domingo 25). */
async function fixture(): Promise<TestClient> {
  const api = await client();
  for (const name of ['SIGA', 'Zeta', 'Logbook']) {
    expect((await api.post('/projects').send({ name, color: 'violeta' })).status).toBe(201);
  }
  const card = async (project: string, title: string, status: string) =>
    ((await api.post('/cards').send({ project, title, status })).body as { ref: string }).ref;
  const t1 = await card('siga', 'Migrar reportes', 'todo');
  const t2 = await card('siga', 'Corregir login', 'todo');
  const t3 = await card('logbook', 'API de bitácora', 'todo');
  const t4 = await card('logbook', 'Vista Mi día', 'backlog');
  const t5 = await card('zeta', 'Revisar docs', 'todo');

  const note = async (ref: string, body: string, occurredAt: string) =>
    expect((await api.post(`/cards/${ref}/log`).send({ body, occurredAt })).status).toBe(201);
  const move = async (ref: string, at: string, status: string, reason?: string) => {
    vi.setSystemTime(new Date(at));
    const res = await api
      .post(`/cards/${ref}/move`)
      .send({ status, ...(reason ? { reason } : {}) });
    expect(res.status).toBe(200);
  };

  vi.useFakeTimers({ toFake: ['Date'] });
  await move(t1, '2026-10-20T09:00:00-03:00', 'in_progress');
  await note(
    t1,
    'Avancé la consulta base.\nQuedó pendiente el índice.',
    '2026-10-20T10:00:00-03:00',
  );
  await note(t1, 'Quedó listo el reporte', '2026-10-21T15:00:00-03:00');
  await move(t1, '2026-10-22T12:00:00-03:00', 'done');
  await move(t2, '2026-10-22T14:00:00-03:00', 'blocked', 'espero respuesta del cliente');
  await note(t3, 'Definí el endpoint', '2026-10-23T10:00:00-03:00');
  await move(t4, '2026-10-23T11:00:00-03:00', 'todo');
  await note(t5, 'Revisé la guía', '2026-10-25T23:30:00-03:00');
  // Fuera del período: dos minutos antes del lunes y justo después del domingo.
  await note(t3, 'semana anterior', '2026-10-18T23:58:00-03:00');
  await note(t5, 'semana siguiente', '2026-10-26T00:30:00-03:00');
  vi.useRealTimers();
  return api;
}

const WEEK = '/summary?from=2026-10-19&to=2026-10-25';

const EXPECTED = `## Semana 43 — 2026-10-19 a 2026-10-25

### Logbook

- **T-3** API de bitácora — Definí el endpoint (vie 23)
- **T-4** Vista Mi día — Backlog → Por hacer (vie 23)

### SIGA

- **T-1** Migrar reportes — Avancé la consulta base. Quedó pendiente el índice. (mar 20); Quedó listo el reporte (mié 21); Por hacer → En curso → Hecho (jue 22)
- **T-2** Corregir login — Bloqueado: espero respuesta del cliente (jue 22); Por hacer → Bloqueado (jue 22)

### Zeta

- **T-5** Revisar docs — Revisé la guía (dom 25)
`;

describe('GET /summary (RF-43)', () => {
  it('RF-43 el markdown de la semana coincide exactamente con el formato', async () => {
    const api = await fixture();
    const res = await api.get(WEEK);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/markdown; charset=utf-8');
    expect(res.text).toBe(EXPECTED);
  });

  it('RF-43 format=md es el valor por defecto y format=json devuelve la estructura de /log', async () => {
    const api = await fixture();
    expect((await api.get(`${WEEK}&format=md`)).text).toBe(EXPECTED);
    const json = await api.get(`${WEEK}&format=json`);
    expect(json.status).toBe(200);
    const log = await api.get('/log?from=2026-10-19&to=2026-10-25');
    expect(json.body).toEqual(log.body);
    expect((await api.get(`${WEEK}&format=xml`)).status).toBe(400);
  });

  it('RF-44 project limita el resumen a un proyecto', async () => {
    const api = await fixture();
    const res = await api.get(`${WEEK}&project=zeta`);
    expect(res.text).toBe(
      '## Semana 43 — 2026-10-19 a 2026-10-25\n\n### Zeta\n\n- **T-5** Revisar docs — Revisé la guía (dom 25)\n',
    );
  });

  it('RF-43 kinds=note deja fuera las entradas de sistema', async () => {
    const api = await fixture();
    const res = await api.get(`${WEEK}&project=siga&kinds=note`);
    expect(res.text).toBe(
      '## Semana 43 — 2026-10-19 a 2026-10-25\n\n### SIGA\n\n- **T-1** Migrar reportes — Avancé la consulta base. Quedó pendiente el índice. (mar 20); Quedó listo el reporte (mié 21)\n',
    );
  });

  it('RF-43 sin from/to resume hoy en APP_TIMEZONE con título de día; sin actividad lo dice', async () => {
    const api = await fixture();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-23T14:00:00Z'));
    expect((await api.get('/summary')).text).toBe(
      '## Día 2026-10-23\n\n### Logbook\n\n- **T-3** API de bitácora — Definí el endpoint (vie 23)\n- **T-4** Vista Mi día — Backlog → Por hacer (vie 23)\n',
    );
    vi.setSystemTime(new Date('2026-12-01T14:00:00Z'));
    expect((await api.get('/summary')).text).toBe(
      '## Día 2026-12-01\n\n_Sin actividad en el período._\n',
    );
  });

  it('RF-43 valida los filtros', async () => {
    const api = await fixture();
    expect((await api.get('/summary?from=2026-10-25&to=2026-10-19')).status).toBe(400);
    expect((await api.get('/summary?project=no-existe')).status).toBe(404);
  });
});
