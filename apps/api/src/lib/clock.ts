/** Reloj de la app (regla 13): los tests lo simulan con `vi.setSystemTime`; nunca `now()` de Postgres. */
export function now(): Date {
  return new Date();
}

/**
 * Zona horaria inicial (`APP_TIMEZONE`, UTC si no está definida): solo vale mientras `app_setting` no tenga la
 * fila `timezone`; después manda el `timezone` de `/settings` (decidido 2026-10-21, #13).
 */
export function initialTimezone(): string {
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

/** Fecha `YYYY-MM-DD` de un instante en la zona IANA `timeZone`. */
export function dateInTimezone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}
