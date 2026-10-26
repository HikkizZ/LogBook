import type { ApiTokenDto } from '../../api/admin-queries';

export const WARN_DAYS = 14;
const DAY_MS = 86_400_000;

export type TokenStatus =
  { kind: 'revoked' } | { kind: 'expired' } | { kind: 'soon'; days: number } | { kind: 'active' };

/** Estado de vencimiento (RF-61, §4.7): revocado > vencido > vence en ≤ 14 días > vigente. */
export function tokenStatus(token: ApiTokenDto, now: number): TokenStatus {
  if (token.revokedAt) return { kind: 'revoked' };
  const left = Date.parse(token.expiresAt) - now;
  if (left <= 0) return { kind: 'expired' };
  const days = Math.ceil(left / DAY_MS);
  return days <= WARN_DAYS ? { kind: 'soon', days } : { kind: 'active' };
}

export function formatInstant(iso: string, timeZone?: string): string {
  const format = (tz?: string) =>
    new Intl.DateTimeFormat('es', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: tz,
    });
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = format(timeZone);
  } catch {
    formatter = format();
  }
  return formatter.format(new Date(iso)).replace(/\./g, '');
}
