import express, { json } from 'express';
import type { Express } from 'express';
import request from 'supertest';
import { createTokenBodySchema, loginBodySchema } from 'shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError, errorHandler } from './errors.js';
import { validate } from './validate.js';

// App mínima del test: no usa createApp().
function miniApp(): Express {
  const app = express();
  app.use(json({ limit: '1kb' }));

  app.post('/echo', validate({ body: loginBodySchema }), (req, res) => {
    res.json({ body: req.body as unknown });
  });
  app.post('/tokens', validate({ body: createTokenBodySchema }), (req, res) => {
    res.json({ body: req.body as unknown });
  });
  app.get(
    '/items/:id',
    validate({
      params: z.object({ id: z.coerce.number().int() }),
      query: z.object({ limit: z.coerce.number().int().min(1).default(20) }),
    }),
    (req, res) => {
      res.json({ id: req.params['id'], limit: (req.query as { limit: unknown }).limit });
    },
  );
  app.get('/forbidden', () => {
    throw new AppError('FORBIDDEN');
  });
  app.get('/unauthorized', () => {
    throw new AppError('UNAUTHORIZED');
  });
  app.get('/boom', () => {
    throw new Error('detalle interno secreto');
  });
  app.get('/boom-async', async () => {
    await Promise.resolve();
    throw new Error('detalle interno secreto');
  });

  app.use(errorHandler);
  return app;
}

describe('RS-07 validación con Zod', () => {
  it('RS-07 body inválido responde 400 VALIDATION_ERROR con details[].path', async () => {
    const res = await request(miniApp()).post('/echo').send({ password: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual([
      expect.objectContaining({ path: 'password', message: expect.any(String) }),
    ]);
    expect(res.body.error.message).toContain('password');
  });

  it('RS-07 body ausente o con tipo equivocado responde 400', async () => {
    const empty = await request(miniApp()).post('/echo');
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('VALIDATION_ERROR');

    const wrong = await request(miniApp()).post('/echo').send({ password: 123 });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.details[0].path).toBe('password');
  });

  it('RS-07 body válido pasa al handler', async () => {
    const res = await request(miniApp()).post('/echo').send({ password: 'x' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ body: { password: 'x' } });
  });

  it('RS-07 los esquemas de shared se aplican (name de token > 80 caracteres)', async () => {
    const res = await request(miniApp())
      .post('/tokens')
      .send({ name: 'a'.repeat(81) });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('name');
  });

  it('RS-07 params y query se validan y se reemplazan por el valor parseado', async () => {
    const ok = await request(miniApp()).get('/items/7?limit=5');
    expect(ok.body).toEqual({ id: 7, limit: 5 });

    const defaults = await request(miniApp()).get('/items/7');
    expect(defaults.body).toEqual({ id: 7, limit: 20 });

    const bad = await request(miniApp()).get('/items/abc?limit=0');
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
      'id',
      'limit',
    ]);
  });

  it('RS-07 JSON mal formado responde 400 VALIDATION_ERROR', async () => {
    const res = await request(miniApp())
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{"password":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('RS-07 formato de errores (§4.2)', () => {
  it('RS-07 error inesperado responde 500 INTERNAL sin stack ni detalle', async () => {
    for (const path of ['/boom', '/boom-async']) {
      const res = await request(miniApp()).get(path);
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL');
      expect(Object.keys(res.body)).toEqual(['error']);
      expect(res.text).not.toContain('stack');
      expect(res.text).not.toContain('detalle interno secreto');
      expect(res.text).not.toMatch(/at .*\.(ts|js)/);
    }
  });

  it('RS-07 AppError("FORBIDDEN") responde 403 con code FORBIDDEN', async () => {
    const res = await request(miniApp()).get('/forbidden');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(typeof res.body.error.message).toBe('string');
  });

  it('RS-07 AppError("UNAUTHORIZED") responde 401 con code UNAUTHORIZED', async () => {
    const res = await request(miniApp()).get('/unauthorized');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('RS-07 body mayor al límite responde 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await request(miniApp())
      .post('/echo')
      .send({ password: 'x'.repeat(2000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('RS-07 AppError conserva el mensaje y los details que se le pasan', () => {
    const err = new AppError('CONFLICT', 'nombre duplicado', [{ path: 'name', message: 'dup' }]);
    expect(err.status).toBe(409);
    expect(err.details).toEqual([{ path: 'name', message: 'dup' }]);
  });
});
