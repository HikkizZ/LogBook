import { createHash, randomBytes } from 'node:crypto';
import { getDataSource } from '../db/client.js';
import { Session } from '../entities/index.js';

const HOUR_MS = 60 * 60 * 1000;
export const SESSION_TTL_MS = 7 * 24 * HOUR_MS;
export const SESSION_IDLE_MS = 12 * HOUR_MS;
const LAST_SEEN_INTERVAL_MS = 60 * 1000;

// 32 bytes en base64url = 43 caracteres; cualquier otro valor se rechaza sin consultar la base.
const SESSION_ID_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export function hashSessionId(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('hex');
}

/** Abre una sesión. El ID en claro solo se devuelve aquí; en la base va su SHA-256. */
export async function createSession(
  now: Date = new Date(),
): Promise<{ sessionId: string; row: Session }> {
  const sessionId = randomBytes(32).toString('base64url');
  const repo = getDataSource().getRepository(Session);
  const row = await repo.save(
    repo.create({
      idHash: hashSessionId(sessionId),
      createdAt: now,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      lastSeenAt: now,
      revokedAt: null,
    }),
  );
  return { sessionId, row };
}

/** Devuelve la fila si la sesión es válida en `now` (no revocada, no vencida, con uso en las últimas 12 h); si no, `null`. */
export async function verifySession(
  sessionId: string,
  now: Date = new Date(),
): Promise<Session | null> {
  if (!SESSION_ID_FORMAT.test(sessionId)) return null;

  const repo = getDataSource().getRepository(Session);
  const row = await repo.findOneBy({ idHash: hashSessionId(sessionId) });
  if (!row) return null;

  if (row.revokedAt !== null) return null;
  if (now.getTime() >= row.expiresAt.getTime()) return null;
  if (now.getTime() >= row.lastSeenAt.getTime() + SESSION_IDLE_MS) return null;

  // Como mucho una vez por minuto; la condición va en el UPDATE para que sea atómica.
  const threshold = new Date(now.getTime() - LAST_SEEN_INTERVAL_MS);
  const result = await repo
    .createQueryBuilder()
    .update()
    .set({ lastSeenAt: now })
    .where('id = :id AND last_seen_at <= :threshold', { id: row.id, threshold })
    .execute();
  if (result.affected) row.lastSeenAt = now;

  return row;
}

/** Revoca la sesión por su ID interno; `false` si no existe o ya estaba revocada. */
export async function revokeSession(id: string, now: Date = new Date()): Promise<boolean> {
  const result = await getDataSource()
    .getRepository(Session)
    .createQueryBuilder()
    .update()
    .set({ revokedAt: now })
    .where('id = :id AND revoked_at IS NULL', { id })
    .execute();
  return (result.affected ?? 0) > 0;
}

/** Revoca todas las sesiones aún no revocadas; devuelve cuántas. */
export async function revokeAllSessions(now: Date = new Date()): Promise<number> {
  const result = await getDataSource()
    .getRepository(Session)
    .createQueryBuilder()
    .update()
    .set({ revokedAt: now })
    .where('revoked_at IS NULL')
    .execute();
  return result.affected ?? 0;
}

/** Borra las sesiones revocadas o vencidas (absoluto o por inactividad); devuelve cuántas. */
export async function purgeSessions(now: Date = new Date()): Promise<number> {
  const result = await getDataSource()
    .getRepository(Session)
    .createQueryBuilder()
    .delete()
    .where('revoked_at IS NOT NULL OR expires_at <= :now OR last_seen_at <= :idleLimit', {
      now,
      idleLimit: new Date(now.getTime() - SESSION_IDLE_MS),
    })
    .execute();
  return result.affected ?? 0;
}
