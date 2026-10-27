/** Aritmética de fechas `YYYY-MM-DD` para Mi día y Mi semana (RF-40, RF-41), sin zonas de por medio. */

const DAY_MS = 86_400_000;

const toMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  return fromMs(toMs(date) + days * DAY_MS);
}

/** Lunes de la semana ISO que contiene `date`. */
export function mondayOf(date: string): string {
  const weekday = new Date(toMs(date)).getUTCDay(); // 0 = domingo
  return addDays(date, -((weekday + 6) % 7));
}

/** Lunes y domingo de la semana de `date`. */
export function weekRange(date: string): { from: string; to: string } {
  const from = mondayOf(date);
  return { from, to: addDays(from, 6) };
}

/** Número de semana ISO 8601 (la semana de un jueves pertenece a su año). */
export function isoWeek(date: string): number {
  const thursday = addDays(mondayOf(date), 3);
  const yearStart = `${thursday.slice(0, 4)}-01-01`;
  return Math.floor((toMs(thursday) - toMs(yearStart)) / DAY_MS / 7) + 1;
}

/** "Martes 21" (cabecera de día de Mi semana, §4.4). */
export function formatDayHeading(date: string): string {
  const text = new Intl.DateTimeFormat('es', {
    weekday: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(toMs(date)));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "martes 21 de octubre de 2026" para el título de Mi día. */
export function formatLongDate(date: string): string {
  return new Intl.DateTimeFormat('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(toMs(date)));
}
