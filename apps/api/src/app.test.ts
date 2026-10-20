import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Project } from './entities/index.js';
import { app } from './test/helpers.js';
import { testDataSource } from './test/db.js';

describe('health', () => {
  it('GET /api/v1/health responde ok', async () => {
    const res = await request(app()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: true });
  });
});

describe('base de datos de test', () => {
  it('inserta un proyecto y lo lee, con id uuidv7 generado por Postgres', async () => {
    const repo = testDataSource().getRepository(Project);
    await repo.insert({ name: 'Proyecto de prueba', slug: 'proyecto-de-prueba', color: 'violeta' });

    const found = await repo.findOneByOrFail({ slug: 'proyecto-de-prueba' });
    expect(found.name).toBe('Proyecto de prueba');
    expect(found.wipLimit).toBe(3);
    expect(found.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
  });

  it('los tests arrancan con las tablas vacías (truncado entre tests)', async () => {
    expect(await testDataSource().getRepository(Project).count()).toBe(0);
  });
});
