import { describe, expect, it } from 'vitest';
import { client } from '../../test/helpers.js';

function cursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('B-1 RS-07 el cursor de GET /cards se valida antes de llegar a la base', () => {
  const invalid: [string, unknown][] = [
    ['p fuera de int4', { s: 'backlog', p: 2147483648, n: 1 }],
    ['n fuera de int4', { s: 'backlog', p: 0, n: 2147483648 }],
    ['p entero seguro de JS', { s: 'backlog', p: Number.MAX_SAFE_INTEGER, n: 1 }],
    ['p negativo', { s: 'backlog', p: -1, n: 1 }],
    ['p decimal', { s: 'backlog', p: 1.5, n: 1 }],
    ['p texto', { s: 'backlog', p: '1', n: 1 }],
    ['estado desconocido', { s: 'nope', p: 0, n: 1 }],
    ['JSON null', null],
  ];

  it.each(invalid)('B-1 RS-07: %s → 400 con details[].path = cursor', async (_name, value) => {
    const api = await client();
    const res = await api.get(`/cards?cursor=${cursor(value)}`);
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    const error = (res.body as { error: { code: string; details: { path: string }[] } }).error;
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details[0]?.path).toBe('cursor');
  });

  it('B-1 RS-07: un cursor que no es base64url/JSON → 400 con path cursor', async () => {
    const api = await client();
    const res = await api.get('/cards?cursor=%25%25no-es-un-cursor');
    expect(res.status).toBe(400);
    expect((res.body as { error: { details: { path: string }[] } }).error.details[0]?.path).toBe(
      'cursor',
    );
  });

  it('B-1 RS-07: los extremos válidos de int4 siguen aceptándose (200)', async () => {
    const api = await client();
    const res = await api.get(
      `/cards?cursor=${cursor({ s: 'done', p: 2147483647, n: 2147483647 })}`,
    );
    expect(res.status).toBe(200);
  });
});
