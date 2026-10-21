import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, client } from '../../test/helpers.js';
import type { TestClient } from '../../test/helpers.js';

interface Hit {
  card: { ref: string; project: string; title: string };
  snippet: string;
}
interface EntryHit extends Hit {
  entry: { cardRef: string; body: string; kind: string };
}
interface Result {
  cards: Hit[];
  entries: EntryHit[];
}

async function search(api: TestClient, q: string, extra = ''): Promise<Result> {
  const res = await api.get(`/search?q=${encodeURIComponent(q)}${extra}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as Result;
}

async function card(api: TestClient, title: string, description = ''): Promise<string> {
  const res = await api.post('/cards').send({ project: 'alfa', title, description });
  expect(res.status).toBe(201);
  return (res.body as { ref: string }).ref;
}

async function setup(): Promise<TestClient> {
  const api = await client();
  expect((await api.post('/projects').send({ name: 'Alfa', color: 'violeta' })).status).toBe(201);
  return api;
}

describe('RF-52 búsqueda con tsvector spanish', () => {
  it('RF-52 "migración" encuentra "migracion" y al revés (el stemmer spanish ignora la tilde)', async () => {
    const api = await setup();
    await card(api, 'Plan de migracion de datos');
    await card(api, 'Revisar la migración del módulo');
    const sinTilde = await search(api, 'migracion');
    const conTilde = await search(api, 'migración');
    expect(sinTilde.cards.map((h) => h.card.ref).sort()).toEqual(['T-1', 'T-2']);
    expect(conTilde.cards.map((h) => h.card.ref).sort()).toEqual(['T-1', 'T-2']);
  });

  it('RF-52 busca por formas de la misma palabra (stemming): "facturas" encuentra "factura"', async () => {
    const api = await setup();
    await card(api, 'Emitir factura mensual');
    expect((await search(api, 'facturas')).cards).toHaveLength(1);
  });

  it('RF-50 busca también en la descripción', async () => {
    const api = await setup();
    await card(api, 'Tarea uno', 'Hay que exportar el inventario completo');
    const res = await search(api, 'inventario');
    expect(res.cards.map((h) => h.card.title)).toEqual(['Tarea uno']);
  });

  it('RF-52 respaldo ILIKE: pliega tildes donde el stemmer no llega ("facturacion" → "facturación")', async () => {
    const api = await setup();
    await card(api, 'Módulo de facturación');
    expect((await search(api, 'facturacion')).cards).toHaveLength(1);
  });

  it('RF-52 respaldo ILIKE: un prefijo de al menos 3 letras encuentra la palabra completa', async () => {
    const api = await setup();
    await card(api, 'Optimizar consultas lentas');
    expect((await search(api, 'consul')).cards).toHaveLength(1);
    expect((await search(api, 'zzzz')).cards).toHaveLength(0);
  });

  it('RF-52 los comodines de LIKE en q se toman literales', async () => {
    const api = await setup();
    await card(api, 'Tarea normal');
    await card(api, 'Avance 100% listo');
    const res = await search(api, '100%');
    expect(res.cards.map((h) => h.card.title)).toEqual(['Avance 100% listo']);
    expect((await search(api, '___')).cards).toHaveLength(0);
  });

  it('RF-50 el texto buscado se resalta con <mark> y el resto del snippet va escapado', async () => {
    const api = await setup();
    await card(api, 'Revisar <script>alert(1)</script> en la migración & más');
    const res = await search(api, 'migración');
    const snippet = res.cards[0]?.snippet ?? '';
    expect(snippet).toContain('<mark>migración</mark>');
    expect(snippet).not.toContain('<script>');
    expect(snippet).toContain('&lt;script&gt;');
    expect(snippet).toContain('&amp;');
  });

  it('RF-50 devuelve el proyecto de cada tarjeta', async () => {
    const api = await setup();
    await card(api, 'Algo con presupuesto');
    expect((await search(api, 'presupuesto')).cards[0]?.card.project).toBe('alfa');
  });
});

describe('RF-50 entradas de bitácora', () => {
  it('RF-50 las entradas aparecen con su tarjeta y el fragmento resaltado', async () => {
    const api = await setup();
    const ref = await card(api, 'Tarea sin relación');
    expect(
      (await api.post(`/cards/${ref}/log`).send({ body: 'Se resolvió el deadlock del servidor' }))
        .status,
    ).toBe(201);
    const res = await search(api, 'deadlock');
    expect(res.cards).toHaveLength(0);
    expect(res.entries).toHaveLength(1);
    const hit = res.entries[0];
    if (!hit) throw new Error('sin entradas');
    expect(hit.entry.cardRef).toBe(ref);
    expect(hit.card.ref).toBe(ref);
    expect(hit.card.title).toBe('Tarea sin relación');
    expect(hit.snippet).toContain('<mark>deadlock</mark>');
  });

  it('RF-50 tarjetas y entradas vienen en listas separadas, tarjetas primero en la respuesta', async () => {
    const api = await setup();
    const ref = await card(api, 'Informe trimestral');
    await api.post(`/cards/${ref}/log`).send({ body: 'Terminé el informe parcial' });
    const res = await search(api, 'informe');
    expect(Object.keys(res)).toEqual(['cards', 'entries']);
    expect(res.cards).toHaveLength(1);
    expect(res.entries).toHaveLength(1);
  });

  it('RF-52 una entrada también se halla por el respaldo ILIKE', async () => {
    const api = await setup();
    const ref = await card(api, 'Cualquiera');
    await api.post(`/cards/${ref}/log`).send({ body: 'Reunión de coordinación' });
    expect((await search(api, 'coordina')).entries).toHaveLength(1);
  });
});

describe('RF-51 referencia T-<n>', () => {
  it('RF-51 q = "T-3" devuelve esa tarjeta primero, antes de otras que la mencionan', async () => {
    const api = await setup();
    await card(api, 'Tarea uno');
    await card(api, 'Tarea dos');
    await card(api, 'Tarea tres');
    await card(api, 'Seguimiento de T-3 pendiente', 'ver T-3');
    const res = await search(api, 'T-3');
    expect(res.cards[0]?.card.ref).toBe('T-3');
    expect(res.cards[0]?.card.title).toBe('Tarea tres');
    expect(res.cards.filter((h) => h.card.ref === 'T-3')).toHaveLength(1);
  });

  it('RF-51 la exacta cuenta dentro de limit', async () => {
    const api = await setup();
    for (const t of ['uno', 'dos', 'tres']) await card(api, `T-2 ${t}`);
    const res = await search(api, 'T-2', '&limit=2');
    expect(res.cards).toHaveLength(2);
    expect(res.cards[0]?.card.ref).toBe('T-2');
  });

  it('RF-51 si T-<n> no existe no es error: lista vacía', async () => {
    const api = await setup();
    await card(api, 'Tarea uno');
    expect((await search(api, 'T-99')).cards).toHaveLength(0);
    expect((await search(api, 'T-99999999999999')).cards).toHaveLength(0);
  });
});

describe('RF-52 validación de q y limit', () => {
  it.each([
    ['q ausente', ''],
    ['q de 2 caracteres', '?q=ab'],
    ['q de 2 caracteres tras recortar espacios', '?q=%20ab%20'],
    ['q vacío', '?q='],
    ['q de más de 200 caracteres', `?q=${'a'.repeat(201)}`],
    ['limit 0', '?q=hola&limit=0'],
    ['limit 101', '?q=hola&limit=101'],
    ['limit no numérico', '?q=hola&limit=x'],
  ])('RF-52 %s responde 400 VALIDATION_ERROR', async (_name, qs) => {
    const api = await client();
    const res = await api.get(`/search${qs}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('RF-52 limit acota cada lista y por defecto es 20', async () => {
    const api = await setup();
    for (let i = 0; i < 22; i++) await card(api, `Reporte número ${i}`);
    expect((await search(api, 'reporte')).cards).toHaveLength(20);
    expect((await search(api, 'reporte', '&limit=5')).cards).toHaveLength(5);
  });

  it('RF-52 q de exactamente 3 caracteres busca', async () => {
    const api = await setup();
    await card(api, 'Pagar luz');
    expect((await search(api, 'luz')).cards).toHaveLength(1);
  });

  it('RS-03 sin credencial responde 401', async () => {
    expect((await request(app()).get('/api/v1/search?q=hola')).status).toBe(401);
  });
});
