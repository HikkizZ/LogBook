import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDataSource } from '../db/client.js';
import { createLogger } from '../logger.js';
import { startSessionPurge } from './purge.js';
import { createSession, revokeSession } from './sessions.js';

const DAY = 24 * 60 * 60 * 1000;

afterEach(() => {
  vi.useRealTimers();
});

const count = async (): Promise<number> =>
  (await getDataSource().query<{ n: string }[]>('SELECT count(*) AS n FROM session'))[0]
    ?.n as unknown as number;

describe('RS-03 purga de sesiones', () => {
  it('RS-03 purga al arrancar y cada 24 h, con un temporizador que no mantiene vivo el proceso', async () => {
    const dead = await createSession();
    await revokeSession(dead.row.id);
    await createSession();

    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    const timer = startSessionPurge(createLogger('silent'));
    expect(timer.hasRef()).toBe(false);
    await vi.waitFor(async () => expect(Number(await count())).toBe(1));

    // La sesión viva pasa a vencida (7 d) y la purga diaria la borra.
    vi.setSystemTime(Date.now() + 8 * DAY);
    await vi.advanceTimersByTimeAsync(DAY);
    await vi.waitFor(async () => expect(Number(await count())).toBe(0));
    clearInterval(timer);
  });
});
