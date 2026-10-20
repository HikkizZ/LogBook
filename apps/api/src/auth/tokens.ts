import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { getDataSource } from '../db/client.js';
import { ApiToken } from '../entities/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const TOKEN_TTL_MS = 90 * DAY_MS;
const LAST_USED_INTERVAL_MS = 60 * 1000;

// lb_<id8>.<32 bytes en base64url = 43 caracteres>
const TOKEN_FORMAT = /^lb_([A-Za-z0-9_-]{8})\.([A-Za-z0-9_-]{43})$/;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateToken(): { token: string; prefix: string; hash: string } {
  const prefix = randomBytes(6).toString('base64url'); // 8 caracteres
  const secret = randomBytes(32).toString('base64url');
  const token = `lb_${prefix}.${secret}`;
  return { token, prefix, hash: hashToken(token) };
}

/** Crea un token que vence a los 90 días. El valor en claro solo se devuelve aquí. */
export async function createToken(
  name: string,
  now: Date = new Date(),
): Promise<{ token: string; row: ApiToken }> {
  const { token, prefix, hash } = generateToken();
  const repo = getDataSource().getRepository(ApiToken);
  const row = await repo.save(
    repo.create({
      name,
      prefix,
      tokenHash: hash,
      createdAt: now,
      expiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
      lastUsedAt: null,
      revokedAt: null,
    }),
  );
  return { token, row };
}

/** Devuelve la fila si el token es válido en `now`; `null` si no (formato, prefijo, secreto, revocado, vencido). */
export async function verifyToken(raw: string, now: Date = new Date()): Promise<ApiToken | null> {
  const match = TOKEN_FORMAT.exec(raw);
  if (!match) return null;

  const repo = getDataSource().getRepository(ApiToken);
  const row = await repo.findOneBy({ prefix: match[1] as string });
  if (!row) return null;

  const given = Buffer.from(hashToken(raw), 'hex');
  const stored = Buffer.from(row.tokenHash, 'hex');
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) return null;

  if (row.revokedAt !== null) return null;
  if (now.getTime() >= row.expiresAt.getTime()) return null;

  // Como mucho una vez por minuto; la condición va en el UPDATE para que sea atómica.
  const threshold = new Date(now.getTime() - LAST_USED_INTERVAL_MS);
  const result = await repo
    .createQueryBuilder()
    .update()
    .set({ lastUsedAt: now })
    .where('id = :id AND (last_used_at IS NULL OR last_used_at <= :threshold)', {
      id: row.id,
      threshold,
    })
    .execute();
  if (result.affected) row.lastUsedAt = now;

  return row;
}

/** Revoca el token; `false` si no existe o ya estaba revocado. */
export async function revokeToken(id: string, now: Date = new Date()): Promise<boolean> {
  const result = await getDataSource()
    .getRepository(ApiToken)
    .createQueryBuilder()
    .update()
    .set({ revokedAt: now })
    .where('id = :id AND revoked_at IS NULL', { id })
    .execute();
  return (result.affected ?? 0) > 0;
}
