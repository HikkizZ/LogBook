import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { getDataSource } from '../../db/client.js';
import { CSRF, app, client, login } from '../../test/helpers.js';
import type { TestClient } from '../../test/helpers.js';

async function newProject(api: TestClient, name = 'Alfa') {
  const res = await api.post('/projects').send({ name, color: 'violeta' });
  expect(res.status).toBe(201);
  return res.body as { id: string; slug: string; name: string };
}

describe('RF-01 crear proyecto', () => {
  it('RF-01 crea con nombre y color y devuelve el Project (sin cardCounts)', async () => {
    const api = await client();
    const res = await api.post('/projects').send({ name: 'Mi Proyecto', color: 'turquesa' });
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual([
      'archivedAt',
      'color',
      'createdAt',
      'githubRepo',
      'id',
      'name',
      'slug',
      'updatedAt',
      'wipLimit',
    ]);
    expect(res.body).toMatchObject({
      name: 'Mi Proyecto',
      slug: 'mi-proyecto',
      color: 'turquesa',
      githubRepo: null,
      wipLimit: 3,
      archivedAt: null,
    });
  });

  it('RF-01 acepta repo de GitHub owner/repo y wipLimit', async () => {
    const api = await client();
    const res = await api
      .post('/projects')
      .send({ name: 'Con repo', color: 'oliva', githubRepo: 'HikkizZ/LogBook', wipLimit: 0 });
    expect(res.status).toBe(201);
    expect(res.body.githubRepo).toBe('HikkizZ/LogBook');
    expect(res.body.wipLimit).toBe(0);
  });

  it('RF-01 rechaza color fuera de la paleta, repo mal formado y nombre vacío con 400', async () => {
    const api = await client();
    for (const body of [
      { name: 'x', color: 'rojo-fuego' },
      { name: 'x', color: 'violeta', githubRepo: 'sin-barra' },
      { name: 'x', color: 'violeta', githubRepo: 'a/b/c' },
      { name: '   ', color: 'violeta' },
      { name: 'x', color: 'violeta', wipLimit: -1 },
    ]) {
      const res = await api.post('/projects').send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('RF-01 nombre duplicado entre activos responde 409; con el original archivado se permite', async () => {
    const api = await client();
    await newProject(api, 'Alfa');
    await newProject(api, 'Beta');
    const dup = await api.post('/projects').send({ name: 'Alfa', color: 'cafe' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('CONFLICT');

    expect((await api.post('/projects/alfa/archive').send()).status).toBe(200);
    const again = await api.post('/projects').send({ name: 'Alfa', color: 'cafe' });
    expect(again.status).toBe(201);
  });
});

describe('RF-02 / RF-03 lectura y edición', () => {
  it('RF-02 GET /projects/:slug devuelve el proyecto y 404 si no existe', async () => {
    const api = await client();
    const p = await newProject(api);
    const ok = await api.get(`/projects/${p.slug}`);
    expect(ok.status).toBe(200);
    expect(ok.body.id).toBe(p.id);
    const missing = await api.get('/projects/no-existe');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });

  it('RF-02 GET /projects lista solo activos y ?archived=true incluye archivados', async () => {
    const api = await client();
    await newProject(api, 'Alfa');
    await newProject(api, 'Beta');
    await api.post('/projects/beta/archive').send();
    const active = await api.get('/projects');
    expect((active.body as { slug: string }[]).map((p) => p.slug)).toEqual(['alfa']);
    const all = await api.get('/projects?archived=true');
    expect((all.body as { slug: string }[]).map((p) => p.slug)).toEqual(['alfa', 'beta']);
    expect((await api.get('/projects?archived=quizas')).status).toBe(400);
  });

  it('RF-02 GET /projects devuelve cardCounts por estado (sin archivadas) para cada proyecto', async () => {
    const api = await client();
    const a = await newProject(api, 'Alfa');
    await newProject(api, 'Beta');
    const insert = (status: string, archived = false) =>
      getDataSource().query(
        `INSERT INTO card (project_id, title, status, position, archived_at)
         VALUES ($1, 'T', $2, 0, CASE WHEN $3 THEN now() END)`,
        [a.id, status, archived],
      );
    await insert('backlog');
    await insert('in_progress');
    await insert('in_progress');
    await insert('done');
    await insert('done', true);
    const res = await api.get('/projects');
    const [alfa, beta] = res.body as { slug: string; cardCounts: Record<string, number> }[];
    expect(alfa?.cardCounts).toEqual({
      backlog: 1,
      todo: 0,
      in_progress: 2,
      review: 0,
      blocked: 0,
      done: 1,
    });
    expect(Object.values(beta?.cardCounts ?? {})).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('RF-03 PATCH edita nombre, color y repo; el slug no cambia', async () => {
    const api = await client();
    const p = await newProject(api, 'Nombre viejo');
    const res = await api
      .patch(`/projects/${p.slug}`)
      .send({ name: 'Nombre nuevo', color: 'magenta', githubRepo: 'a/b', wipLimit: 5 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Nombre nuevo',
      slug: 'nombre-viejo',
      color: 'magenta',
      githubRepo: 'a/b',
      wipLimit: 5,
    });
    const cleared = await api.patch(`/projects/${p.slug}`).send({ githubRepo: null });
    expect(cleared.body.githubRepo).toBeNull();
    expect((await api.get('/projects/nombre-viejo')).status).toBe(200);
    expect((await api.get('/projects/nombre-nuevo')).status).toBe(404);
  });

  it('RF-03 PATCH con slug en el body responde 400 (inmutable)', async () => {
    const api = await client();
    const p = await newProject(api);
    const res = await api.patch(`/projects/${p.slug}`).send({ slug: 'otro' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('RF-03 renombrar a un nombre activo existente responde 409', async () => {
    const api = await client();
    await newProject(api, 'Alfa');
    const b = await newProject(api, 'Beta');
    const res = await api.patch(`/projects/${b.slug}`).send({ name: 'Alfa' });
    expect(res.status).toBe(409);
  });

  it('RF-03 el slug se genera sin acentos y se desambigua si choca', async () => {
    const api = await client();
    const a = await newProject(api, 'Diseño Ñandú');
    expect(a.slug).toBe('diseno-nandu');
    await newProject(api, 'Otro');
    await api.post(`/projects/${a.slug}/archive`).send();
    const again = await newProject(api, 'Diseño Ñandú');
    expect(again.slug).toBe('diseno-nandu-2');
    const weird = await newProject(api, '¡¿?!');
    expect(weird.slug).toBe('proyecto');
  });
});

describe('RF-04 / RF-05 archivar', () => {
  it('RF-04 archivar y desarchivar actualizan archivedAt', async () => {
    const api = await client();
    await newProject(api, 'Alfa');
    await newProject(api, 'Beta');
    const archived = await api.post('/projects/beta/archive').send();
    expect(archived.status).toBe(200);
    expect(archived.body.archivedAt).toEqual(expect.any(String));
    const back = await api.post('/projects/beta/unarchive').send();
    expect(back.status).toBe(200);
    expect(back.body.archivedAt).toBeNull();
  });

  it('RF-04 las tarjetas de un proyecto archivado siguen existiendo', async () => {
    const api = await client();
    const a = await newProject(api, 'Alfa');
    await newProject(api, 'Beta');
    await getDataSource().query(
      `INSERT INTO card (project_id, title, position) VALUES ($1, 'T', 0)`,
      [a.id],
    );
    await api.post('/projects/alfa/archive').send();
    const rows = await getDataSource().query<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM card`,
    );
    expect(rows[0]?.n).toBe(1);
  });

  it('RF-05 archivar el único proyecto activo responde 409', async () => {
    const api = await client();
    await newProject(api, 'Personal');
    const res = await api.post('/projects/personal/archive').send();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('RF-05 con otro activo sí se puede, y el último que queda ya no', async () => {
    const api = await client();
    await newProject(api, 'Personal');
    await newProject(api, 'Trabajo');
    expect((await api.post('/projects/personal/archive').send()).status).toBe(200);
    expect((await api.post('/projects/trabajo/archive').send()).status).toBe(409);
  });

  it('RF-05 dos archivados simultáneos no dejan la app sin proyectos activos', async () => {
    const api = await client();
    await newProject(api, 'Alfa');
    await newProject(api, 'Beta');
    const results = await Promise.all([
      api.post('/projects/alfa/archive').send(),
      api.post('/projects/beta/archive').send(),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('RF-04 desarchivar con un activo del mismo nombre responde 409', async () => {
    const api = await client();
    await newProject(api, 'Alfa');
    await newProject(api, 'Beta');
    await api.post('/projects/alfa/archive').send();
    await newProject(api, 'Alfa'); // slug alfa-2
    const res = await api.post('/projects/alfa/unarchive').send();
    expect(res.status).toBe(409);
  });
});

describe('RF-01..05 autenticación', () => {
  it('toda ruta de /projects exige credencial (401 sin ella)', async () => {
    const application = app();
    for (const [method, path] of [
      ['get', '/projects'],
      ['post', '/projects'],
      ['get', '/projects/x'],
      ['patch', '/projects/x'],
      ['post', '/projects/x/archive'],
      ['post', '/projects/x/unarchive'],
    ] as const) {
      const res = await request(application)[method](`/api/v1${path}`);
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  it('RS-10 con cookie, crear proyecto exige el header CSRF', async () => {
    const application = app();
    const cookie = await login(application);
    const sin = await request(application)
      .post('/api/v1/projects')
      .set('Cookie', cookie)
      .send({ name: 'X', color: 'violeta' });
    expect(sin.status).toBe(403);
    const con = await request(application)
      .post('/api/v1/projects')
      .set(CSRF)
      .set('Cookie', cookie)
      .send({ name: 'X', color: 'violeta' });
    expect(con.status).toBe(201);
  });
});
