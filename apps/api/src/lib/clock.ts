/** Reloj de la app (regla 13): los tests lo simulan con `vi.setSystemTime`; nunca `now()` de Postgres. */
export function now(): Date {
  return new Date();
}

/** Zona horaria de la app (`APP_TIMEZONE`, UTC si no está definida). */
export function appTimezone(): string {
  return process.env['APP_TIMEZONE']?.trim() || 'UTC';
}

/** Lanza si `value` (el `APP_TIMEZONE` crudo) no es vacío ni una zona IANA válida; vacío = UTC. */
export function assertTimezone(value: string): void {
  const timeZone = value.trim();
  if (timeZone === '') return;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
  } catch {
    throw new Error('APP_TIMEZONE no es una zona horaria IANA válida (p. ej. America/Santiago)');
  }
}

/** Fecha `YYYY-MM-DD` de un instante en la zona `APP_TIMEZONE` (UTC si no está definida). */
export function dateInAppTimezone(instant: Date): string {
  const timeZone = appTimezone();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}
