import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { getDataSource } from '../../db/client.js';
import { app, client } from '../../test/helpers.js';
import type { TestClient } from '../../test/helpers.js';

async function newLabel(api: TestClient, name: string, color = 'violeta') {
  const res = await api.post('/labels').send({ name, color });
  expect(res.status).toBe(201);
  return res.body as { id: string; name: string; color: string };
}

describe('RF-23 etiquetas', () => {
  it('RF-23 crear devuelve la etiqueta y GET /labels la lista', async () => {
    const api = await client();
    const created = await api.post('/labels').send({ name: 'urgente', color: 'gris' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'urgente', color: 'gris' });
    expect(Object.keys(created.body).sort()).toEqual(['color', 'createdAt', 'id', 'name']);
    await newLabel(api, 'otra', 'oliva');
    const list = await api.get('/labels');
    expect(list.status).toBe(200);
    expect((list.body as { name: string }[]).map((l) => l.name)).toEqual(['urgente', 'otra']);
  });

  it('RF-23 nombre vacío, de más de 40 caracteres o color fuera de la paleta responde 400', async () => {
    const api = await client();
    for (const body of [
      { name: '', color: 'gris' },
      { name: 'x'.repeat(41), color: 'gris' },
      { name: 'ok', color: 'naranja' },
      { name: 'ok' },
    ]) {
      const res = await api.post('/labels').send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('RF-23 Bug y bug son el mismo nombre: la segunda responde 409', async () => {
    const api = await client();
    await newLabel(api, 'Bug', 'magenta');
    for (const name of ['bug', 'BUG', ' bug ']) {
      const res = await api.post('/labels').send({ name, color: 'gris' });
      expect(res.status, name).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    }
  });

  it('RF-23 renombrar: a otro nombre existente (otra capitalización) da 409; cambiar solo la capitalización propia sí', async () => {
    const api = await client();
    const a = await newLabel(api, 'docs');
    await newLabel(api, 'bug');
    const clash = await api.patch(`/labels/${a.id}`).send({ name: 'BUG' });
    expect(clash.status).toBe(409);
    const own = await api.patch(`/labels/${a.id}`).send({ name: 'Docs', color: 'cafe' });
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ name: 'Docs', color: 'cafe' });
  });

  it('RF-23 PATCH/DELETE de una etiqueta inexistente responde 404 y un id mal formado 400', async () => {
    const api = await client();
    const ghost = '0198a000-0000-7000-8000-000000000000';
    expect((await api.patch(`/labels/${ghost}`).send({ name: 'x' })).status).toBe(404);
    expect((await api.delete(`/labels/${ghost}`)).status).toBe(404);
    expect((await api.delete('/labels/no-es-uuid')).status).toBe(400);
  });

  it('RF-23 borrar la etiqueta responde 204 y deja card_label sin filas de ella', async () => {
    const api = await client();
    const project = (await api.post('/projects').send({ name: 'P', color: 'violeta' })).body as {
      id: string;
    };
    const bug = await newLabel(api, 'bug');
    const feat = await newLabel(api, 'feature');
    const db = getDataSource();
    const card = await db.query<{ id: string }[]>(
      `INSERT INTO card (project_id, title, position) VALUES ($1, 'T', 0) RETURNING id`,
      [project.id],
    );
    const cardId = card[0]?.id;
    await db.query(`INSERT INTO card_label (card_id, label_id) VALUES ($1, $2), ($1, $3)`, [
      cardId,
      bug.id,
      feat.id,
    ]);

    const res = await api.delete(`/labels/${bug.id}`);
    expect(res.status).toBe(204);

    const remaining = await db.query<{ label_id: string }[]>(
      `SELECT label_id FROM card_label WHERE card_id = $1`,
      [cardId],
    );
    expect(remaining.map((r) => r.label_id)).toEqual([feat.id]);
    const rowsOfDeleted = await db.query(`SELECT 1 FROM card_label WHERE label_id = $1`, [bug.id]);
    expect(rowsOfDeleted).toHaveLength(0);
    expect((await api.get('/labels')).body).toHaveLength(1);
  });

  it('RF-23 el nombre de una etiqueta borrada puede reutilizarse', async () => {
    const api = await client();
    const a = await newLabel(api, 'bug');
    await api.delete(`/labels/${a.id}`);
    expect((await api.post('/labels').send({ name: 'Bug', color: 'gris' })).status).toBe(201);
  });

  it('RF-23 las rutas de /labels exigen credencial', async () => {
    const application = app();
    expect((await request(application).get('/api/v1/labels')).status).toBe(401);
    expect((await request(application).post('/api/v1/labels')).status).toBe(401);
    expect((await request(application).delete('/api/v1/labels/x')).status).toBe(401);
  });
});
