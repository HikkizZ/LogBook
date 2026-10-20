import { hash, argon2d, argon2i } from 'argon2';
import { describe, expect, it } from 'vitest';
import { assertPasswordHash, hashPassword } from './password.js';

describe('B-5 RS-02 assertPasswordHash', () => {
  it('B-5 RS-02 acepta la salida de hashPassword() y esta tiene m >= 19456', async () => {
    const h = await hashPassword('x');
    expect(() => assertPasswordHash(h)).not.toThrow();
    expect(Number(/\$m=(\d+),/.exec(h)?.[1])).toBeGreaterThanOrEqual(19456);
  });

  it('B-5 RS-02 rechaza basura, vacío y un hash argon2id truncado', async () => {
    const h = await hashPassword('x');
    expect(() => assertPasswordHash('no-es-un-hash')).toThrow(/ADMIN_PASSWORD_HASH/);
    expect(() => assertPasswordHash('')).toThrow(/ADMIN_PASSWORD_HASH/);
    expect(() => assertPasswordHash(h.slice(0, h.lastIndexOf('$')))).toThrow(/ADMIN_PASSWORD_HASH/);
    expect(() => assertPasswordHash(h.slice(0, -10) + '$')).toThrow(/ADMIN_PASSWORD_HASH/);
  });

  it('B-5 RS-02 rechaza argon2i y argon2d', async () => {
    const i = await hash('x', { type: argon2i, memoryCost: 19456 });
    const d = await hash('x', { type: argon2d, memoryCost: 19456 });
    expect(i.startsWith('$argon2i$')).toBe(true);
    expect(() => assertPasswordHash(i)).toThrow(/ADMIN_PASSWORD_HASH/);
    expect(() => assertPasswordHash(d)).toThrow(/ADMIN_PASSWORD_HASH/);
  });

  it('B-5 RS-02 rechaza m=4096 (parámetros débiles)', async () => {
    const weak = await hash('x', { memoryCost: 4096, timeCost: 1, parallelism: 1 });
    expect(weak).toContain('m=4096');
    expect(() => assertPasswordHash(weak)).toThrow(/ADMIN_PASSWORD_HASH/);
  });

  it('B-5 RS-02 el mensaje de error no incluye el hash', () => {
    const bad = '$argon2id$v=19$m=4096,t=1,p=1$c2FsdHNhbHQ$aGFzaGhhc2g';
    try {
      assertPasswordHash(bad);
      expect.unreachable();
    } catch (e) {
      expect(String((e as Error).message)).not.toContain('aGFzaGhhc2g');
    }
  });
});
