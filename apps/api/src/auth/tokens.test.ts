import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDataSource } from '../db/client.js';
import { ApiToken } from '../entities/index.js';
import { createToken, generateToken, hashToken, revokeToken, verifyToken } from './tokens.js';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-03-01T10:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RS-01 tokens de API', () => {
  it('RS-01 generateToken devuelve lb_<id8>.<secreto> con hash SHA-256 hex', () => {
    const { token, prefix, hash } = generateToken();
    expect(token).toMatch(/^lb_[A-Za-z0-9_-]{8}\.[A-Za-z0-9_-]{43}$/);
    expect(token.slice(3, 11)).toBe(prefix);
    expect(hash).toBe(hashToken(token));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('RS-01 un token válido pasa', async () => {
    const { token, row } = await createToken('Claude Code PC');
    const verified = await verifyToken(token);
    expect(verified?.id).toBe(row.id);
    expect(verified?.name).toBe('Claude Code PC');
  });

  it('RS-01 prefijo correcto con secreto incorrecto se rechaza', async () => {
    const { token } = await createToken('x');
    const wrong = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
    expect(await verifyToken(wrong)).toBeNull();
  });

  it('RS-01 un prefijo desconocido o un formato inválido se rechaza', async () => {
    const { token } = generateToken();
    expect(await verifyToken(token)).toBeNull();
    expect(await verifyToken('basura')).toBeNull();
    expect(await verifyToken('')).toBeNull();
  });

  it('RS-01 un token revocado se rechaza', async () => {
    const { token, row } = await createToken('x');
    expect(await revokeToken(row.id)).toBe(true);
    expect(await verifyToken(token)).toBeNull();
    expect(await revokeToken(row.id)).toBe(false);
  });

  it('RS-01 expires_at de un token recién creado es created_at + 90 d exacto', async () => {
    const { row } = await createToken('x');
    const stored = await getDataSource().getRepository(ApiToken).findOneByOrFail({ id: row.id });
    expect(stored.expiresAt.getTime() - stored.createdAt.getTime()).toBe(90 * DAY);
    expect(stored.createdAt.getTime()).toBe(T0.getTime());
  });

  it('RS-01 con el reloj en created_at + 90 d + 1 s se rechaza y en + 90 d - 1 s pasa', async () => {
    const { token } = await createToken('x');
    vi.setSystemTime(new Date(T0.getTime() + 90 * DAY - 1000));
    expect(await verifyToken(token)).not.toBeNull();
    vi.setSystemTime(new Date(T0.getTime() + 90 * DAY + 1000));
    expect(await verifyToken(token)).toBeNull();
  });

  it('RS-01 last_used_at no se actualiza dos veces en el mismo minuto', async () => {
    const { token, row } = await createToken('x');
    const lastUsed = async (): Promise<Date | null> =>
      (await getDataSource().getRepository(ApiToken).findOneByOrFail({ id: row.id })).lastUsedAt;

    expect(await lastUsed()).toBeNull();
    await verifyToken(token);
    expect((await lastUsed())?.getTime()).toBe(T0.getTime());

    vi.setSystemTime(new Date(T0.getTime() + 59_000));
    await verifyToken(token);
    expect((await lastUsed())?.getTime()).toBe(T0.getTime());

    vi.setSystemTime(new Date(T0.getTime() + 61_000));
    await verifyToken(token);
    expect((await lastUsed())?.getTime()).toBe(T0.getTime() + 61_000);
  });

  it('RS-01 en la base nunca hay un token en claro: token_hash son 64 hex', async () => {
    const { token } = await createToken('x');
    const rows = await getDataSource().query<{ token_hash: string; prefix: string }[]>(
      'SELECT token_hash, prefix FROM api_token',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]?.token_hash).toBe(hashToken(token));
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(token);
    expect(dump).not.toContain(token.split('.')[1] as string);
  });
});
