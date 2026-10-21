import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDataSource } from './db/client.js';
import { app } from './test/helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
});

const HEALTH = '/api/v1/health';

describe('§4.12 GET /health', () => {
  it('§4.12 con la base viva responde 200 { ok, db } y nada más, sin credencial', async () => {
    const querySpy = vi.spyOn(getDataSource(), 'query');
    const res = await request(app()).get(HEALTH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: true });
    expect(querySpy).toHaveBeenCalledWith('SELECT 1');
  });

  it('§4.12 si la consulta a la base falla responde 503 { ok: false, db: false }', async () => {
    vi.spyOn(getDataSource(), 'query').mockRejectedValue(new Error('conexión caída'));
    const res = await request(app()).get(HEALTH);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, db: false });
  });

  it('§4.12 si la base no contesta en 2 s responde 503', async () => {
    vi.spyOn(getDataSource(), 'query').mockReturnValue(new Promise(() => undefined));
    const res = await request(app()).get(HEALTH);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, db: false });
  });
});
