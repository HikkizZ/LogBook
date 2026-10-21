import { Writable } from 'node:stream';
import type { Router } from 'express';
import { describe, expect, it } from 'vitest';
import { QueryFailedError } from 'typeorm';
import { getDataSource } from '../db/client.js';
import { createLogger } from '../logger.js';
import { app, client } from '../test/helpers.js';

/** App con un logger real (`createLogger`) sobre un stream capturado y rutas que fallan en la base. */
async function boomClient() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(String(chunk));
      cb();
    },
  });
  const logger = createLogger('info', stream);
  const extraRoutes = (router: Router): void => {
    // Tipo inválido: Postgres lo rechaza con 22P02 y su mensaje cita el valor.
    router.get('/_boom-type', async () => {
      await getDataSource().query('SELECT $1::int AS "consulta-secreta"', ['PARAMETRO-SECRETO']);
    });
    // Violación UNIQUE con contenido en los parámetros.
    router.get('/_boom-unique', async () => {
      const sql = 'INSERT INTO "label"("name", "color") VALUES ($1, $2) /* consulta-secreta */';
      await getDataSource().query(sql, ['PARAMETRO-SECRETO', 'gris']);
      await getDataSource().query(sql, ['PARAMETRO-SECRETO', 'gris']);
    });
  };
  const api = await client(app({ logger, extraRoutes }));
  return { api, output: () => chunks.join('') };
}

describe('M-1 RS-13 un error de base de datos no deja el contenido de la petición en el log', () => {
  it('M-1 RS-13: un QueryFailedError no registra query, parameters ni el mensaje del driver', async () => {
    const { api, output } = await boomClient();
    const res = await api.get('/_boom-type');
    expect(res.status).toBe(500);

    const log = output();
    expect(log).toContain('error no controlado');
    expect(log).not.toContain('PARAMETRO-SECRETO');
    expect(log).not.toContain('consulta-secreta');
    expect(log).not.toContain('SELECT $1');
    // Lo no sensible sí queda: el código SQLSTATE sirve para diagnosticar.
    expect(log).toContain('22P02');
  });

  it('M-1 RS-13: una violación UNIQUE registra la restricción y la tabla, no los valores ni el detail', async () => {
    const { api, output } = await boomClient();
    await api.get('/_boom-unique');

    const log = output();
    expect(log).not.toContain('PARAMETRO-SECRETO');
    expect(log).not.toContain('consulta-secreta');
    expect(log).not.toContain('INSERT INTO');
    expect(log).toContain('23505');
    expect(log).toContain('"table":"label"');
  });

  it('M-1 RS-13: cualquier error pasa por el serializador, también con cause y con query/parameters propios', () => {
    const chunks: string[] = [];
    const logger = createLogger(
      'info',
      new Writable({
        write(chunk, _enc, cb) {
          chunks.push(String(chunk));
          cb();
        },
      }),
    );
    const qfe = new QueryFailedError(
      'INSERT INTO t VALUES ($1)',
      ['PARAMETRO-SECRETO'],
      new Error('x'),
    );
    const wrapper = Object.assign(new Error('envoltorio', { cause: qfe }), {
      query: 'SELECT secreto',
      parameters: ['PARAMETRO-SECRETO'],
    });
    logger.error({ err: wrapper }, 'fallo');

    const log = chunks.join('');
    expect(log).toContain('envoltorio');
    expect(log).not.toContain('PARAMETRO-SECRETO');
    expect(log).not.toContain('INSERT INTO');
    expect(log).not.toContain('SELECT secreto');
  });
});
