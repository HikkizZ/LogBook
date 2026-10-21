import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDataSource } from '../../db/client.js';
import { app, client } from '../../test/helpers.js';

const DEFAULTS = { timezone: 'America/Santiago', doneDaysVisible: 14, wipDefault: 3 };

// El setup global trunca todas las tablas entre tests: se vuelve a sembrar lo que siembra la migración.
beforeEach(async () => {
  await getDataSource().query(
    `INSERT INTO app_setting (key, value) VALUES
       ('timezone', '"America/Santiago"'), ('done_days_visible', '14'), ('wip_default', '3')`,
  );
});

describe('§4.12 GET /settings', () => {
  it('§4.12 devuelve los valores sembrados por la migración en camelCase', async () => {
    const api = await client();
    const res = await api.get('/settings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(DEFAULTS);
  });

  it('§4.12 sin credencial responde 401', async () => {
    expect((await request(app()).get('/api/v1/settings')).status).toBe(401);
  });

  it('§4.12 con la tabla vacía devuelve los valores por defecto', async () => {
    const api = await client();
    await getDataSource().query(`DELETE FROM app_setting`);
    expect((await api.get('/settings')).body).toEqual(DEFAULTS);
  });

  it('§4.12 si falta una fila usa el valor por defecto', async () => {
    const api = await client();
    await getDataSource().query(`DELETE FROM app_setting WHERE key = 'wip_default'`);
    expect((await api.get('/settings')).body).toEqual(DEFAULTS);
  });
});

describe('§4.12 PATCH /settings', () => {
  it('§4.12 cambia solo las claves enviadas y las guarda en snake_case', async () => {
    const api = await client();
    const res = await api.patch('/settings').send({ doneDaysVisible: 30, timezone: 'UTC' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ timezone: 'UTC', doneDaysVisible: 30, wipDefault: 3 });
    expect((await api.get('/settings')).body).toEqual(res.body);
    const rows = await getDataSource().query<{ key: string; value: unknown }[]>(
      `SELECT key, value FROM app_setting ORDER BY key`,
    );
    expect(rows).toEqual([
      { key: 'done_days_visible', value: 30 },
      { key: 'timezone', value: 'UTC' },
      { key: 'wip_default', value: 3 },
    ]);
  });

  it('§4.12 recrea una clave borrada al guardarla', async () => {
    const api = await client();
    await getDataSource().query(`DELETE FROM app_setting WHERE key = 'wip_default'`);
    const res = await api.patch('/settings').send({ wipDefault: 5 });
    expect(res.body.wipDefault).toBe(5);
  });

  it.each([
    ['zona horaria inexistente', { timezone: 'Marte/Olympus' }],
    ['zona horaria que no es texto', { timezone: 3 }],
    ['doneDaysVisible como texto', { doneDaysVisible: '14' }],
    ['doneDaysVisible decimal', { doneDaysVisible: 1.5 }],
    ['doneDaysVisible en 0', { doneDaysVisible: 0 }],
    ['doneDaysVisible sobre el tope', { doneDaysVisible: 366 }],
    ['wipDefault negativo', { wipDefault: -1 }],
    ['wipDefault como booleano', { wipDefault: true }],
    ['clave desconocida', { theme: 'dark' }],
    ['body vacío', {}],
  ])('RS-07 %s responde 400 VALIDATION_ERROR y no cambia nada', async (_name, body) => {
    const api = await client();
    const res = await api.patch('/settings').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect((await api.get('/settings')).body).toEqual(DEFAULTS);
  });
});
