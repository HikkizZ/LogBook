import { Writable } from 'node:stream';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({ chunks: [] as string[], calls: 0 }));

// El logger de respaldo de errorHandler debe salir de createLogger() (con redacción, RS-11).
vi.mock('../logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../logger.js')>();
  return {
    ...actual,
    createLogger: () => {
      captured.calls++;
      const stream = new Writable({
        write(chunk, _enc, cb) {
          captured.chunks.push(String(chunk));
          cb();
        },
      });
      return actual.createLogger('info', stream);
    },
  };
});

const { errorHandler } = await import('./errors.js');

describe('B-6 RS-11 logger de respaldo del errorHandler', () => {
  it('B-6 RS-11: sin req.log, el error se registra con un logger creado por createLogger()', async () => {
    const app = express();
    app.get('/boom', () => {
      throw new Error('fallo inesperado');
    });
    app.use(errorHandler);

    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(captured.calls).toBeGreaterThan(0);
    expect(captured.chunks.join('')).toContain('fallo inesperado');
  });
});
