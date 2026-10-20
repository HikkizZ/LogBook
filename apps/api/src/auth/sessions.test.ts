import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDataSource } from '../db/client.js';
import { Session } from '../entities/index.js';
import { clearSessionCookie, sessionCookie } from './cookie.js';
import {
  createSession,
  hashSessionId,
  purgeSessions,
  revokeAllSessions,
  revokeSession,
  verifySession,
} from './sessions.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const T0 = new Date('2026-03-01T08:00:00.000Z');

const at = (ms: number): Date => new Date(T0.getTime() + ms);
const find = (id: string): Promise<Session> =>
  getDataSource().getRepository(Session).findOneByOrFail({ id });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RS-03 sesiones de la UI', () => {
  it('RS-03 una sesión recién creada pasa y vence a los 7 d desde el login', async () => {
    const { sessionId, row } = await createSession();
    expect(sessionId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await find(row.id);
    expect(stored.createdAt.getTime()).toBe(T0.getTime());
    expect(stored.lastSeenAt.getTime()).toBe(T0.getTime());
    expect(stored.expiresAt.getTime()).toBe(T0.getTime() + 7 * DAY);
    expect(await verifySession(sessionId)).not.toBeNull();
  });

  it('RS-03 a las 11 h 59 min sin uso pasa y a las 12 h 00 min 01 s no', async () => {
    const a = await createSession();
    vi.setSystemTime(at(11 * HOUR + 59 * MIN));
    expect(await verifySession(a.sessionId)).not.toBeNull();

    const b = await createSession(at(11 * HOUR + 59 * MIN));
    vi.setSystemTime(at(11 * HOUR + 59 * MIN + 12 * HOUR + 1000));
    expect(await verifySession(b.sessionId)).toBeNull();
  });

  it('RS-03 sin uso: 12 h 00 min 01 s después del login no pasa', async () => {
    const { sessionId } = await createSession();
    vi.setSystemTime(at(12 * HOUR + 1000));
    expect(await verifySession(sessionId)).toBeNull();
  });

  it('RS-03 usada cada hora durante 6 días pasa, y a los 7 d desde created_at no aunque el último uso fue hace 1 h', async () => {
    const { sessionId } = await createSession();
    for (let h = 1; h <= 7 * 24 - 1; h++) {
      vi.setSystemTime(at(h * HOUR));
      expect(await verifySession(sessionId)).not.toBeNull();
    }
    vi.setSystemTime(at(7 * DAY));
    expect(await verifySession(sessionId)).toBeNull();
  });

  it('RS-03 last_seen_at se actualiza como mucho una vez por minuto', async () => {
    const { sessionId, row } = await createSession();
    vi.setSystemTime(at(30_000));
    await verifySession(sessionId);
    expect((await find(row.id)).lastSeenAt.getTime()).toBe(T0.getTime());
    vi.setSystemTime(at(61_000));
    await verifySession(sessionId);
    expect((await find(row.id)).lastSeenAt.getTime()).toBe(T0.getTime() + 61_000);
    vi.setSystemTime(at(100_000));
    await verifySession(sessionId);
    expect((await find(row.id)).lastSeenAt.getTime()).toBe(T0.getTime() + 61_000);
  });

  it('RS-03 un ID desconocido se rechaza', async () => {
    await createSession();
    expect(await verifySession('no-existe')).toBeNull();
  });

  it('RS-03 una sesión revocada no pasa', async () => {
    const { sessionId, row } = await createSession();
    expect(await revokeSession(row.id)).toBe(true);
    expect(await verifySession(sessionId)).toBeNull();
    expect(await revokeSession(row.id)).toBe(false);
  });

  it('RS-03 revokeAllSessions deja todas con revoked_at', async () => {
    await createSession();
    await createSession();
    await createSession();
    expect(await revokeAllSessions()).toBe(3);
    const rows = await getDataSource().getRepository(Session).find();
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });

  it('RS-03 purgeSessions borra solo las vencidas o revocadas', async () => {
    const valid = await createSession(at(0));
    const revoked = await createSession(at(0));
    await revokeSession(revoked.row.id);
    const absolute = await createSession(at(-7 * DAY - 1000));
    const idle = await createSession(at(-13 * HOUR));

    vi.setSystemTime(at(0));
    expect(await purgeSessions()).toBe(3);

    const left = await getDataSource().getRepository(Session).find();
    expect(left.map((r) => r.id)).toEqual([valid.row.id]);
    expect([absolute.row.id, idle.row.id]).not.toContain(left[0]?.id);
  });

  it('RS-03 id_hash tiene 64 hex y el sessionId en claro no aparece en la tabla', async () => {
    const { sessionId } = await createSession();
    const rows = await getDataSource().query<Record<string, unknown>[]>('SELECT * FROM session');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.['id_hash']).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]?.['id_hash']).toBe(hashSessionId(sessionId));
    expect(JSON.stringify(rows)).not.toContain(sessionId);
  });
});

describe('RS-10 cookie de sesión', () => {
  it('RS-10 sessionCookie lleva exactamente los flags de __Host- y ningún Max-Age/Expires/Domain', () => {
    const cookie = sessionCookie('abc123');
    expect(cookie.startsWith('__Host-lb_session=abc123;')).toBe(true);
    expect(cookie.split('; ')).toEqual([
      '__Host-lb_session=abc123',
      'Path=/',
      'Secure',
      'HttpOnly',
      'SameSite=Strict',
    ]);
    expect(cookie).not.toMatch(/Max-Age|Expires|Domain/i);
  });

  it('RS-10 clearSessionCookie lleva Max-Age=0 y los mismos flags', () => {
    const cookie = clearSessionCookie();
    expect(cookie.startsWith('__Host-lb_session=;')).toBe(true);
    expect(cookie).toContain('Max-Age=0');
    for (const flag of ['Path=/', 'Secure', 'HttpOnly', 'SameSite=Strict']) {
      expect(cookie).toContain(flag);
    }
    expect(cookie).not.toMatch(/Expires|Domain/i);
  });
});
