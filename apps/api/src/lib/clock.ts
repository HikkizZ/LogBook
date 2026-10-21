/** Reloj de la app (regla 13): los tests lo simulan con `vi.setSystemTime`; nunca `now()` de Postgres. */
export function now(): Date {
  return new Date();
}

/** Zona horaria de la app (`APP_TIMEZONE`, UTC si no está definida). */
export function appTimezone(): string {
  return process.env['APP_TIMEZONE']?.trim() || 'UTC';
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
