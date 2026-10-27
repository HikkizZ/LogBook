/** Fecha de hoy (`YYYY-MM-DD`) en la zona horaria de Ajustes, la misma que usa la API para "hoy" (RF-15). */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Días entre dos fechas `YYYY-MM-DD` (`to - from`), sin zonas ni horario de verano de por medio. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** `2026-10-24` → `24 oct`. */
export function formatShortDate(date: string): string {
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00Z`))
    .replace('.', '');
}

export type DueTone = 'overdue' | 'soon' | 'normal' | 'done';

export interface DueInfo {
  tone: DueTone;
  text: string;
}

/** Urgencia de la fecha límite (§4.1, §6.1): siempre icono + texto, el color nunca va solo. */
export function dueInfo(dueDate: string, today: string, done: boolean): DueInfo {
  if (done) return { tone: 'done', text: formatShortDate(dueDate) };
  const days = daysBetween(today, dueDate);
  if (days < 0) {
    return { tone: 'overdue', text: days === -1 ? 'vencida ayer' : `vencida hace ${-days} días` };
  }
  if (days === 0) return { tone: 'soon', text: 'vence hoy' };
  if (days === 1) return { tone: 'soon', text: 'vence mañana' };
  if (days <= 3) return { tone: 'soon', text: `vence en ${days} días` };
  return { tone: 'normal', text: formatShortDate(dueDate) };
}

// ---------------------------------------------------------------------------------------------
// Bitácora (§4.2): instantes con la zona horaria de Ajustes.

function zoneParts(date: Date, timeZone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}

/** Hora `HH:mm` de un instante en la zona dada. */
export function clock(date: Date, timeZone: string): string {
  const p = zoneParts(date, timeZone);
  return `${p.hour}:${p.minute}`;
}

/** "hoy 14:32", "ayer" o "mar 14 oct" (§4.2). La fecha completa va aparte, en `formatAbsolute`. */
export function formatLogTime(iso: string, timeZone: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const diff = daysBetween(todayIn(timeZone, date), todayIn(timeZone, now));
  if (diff === 0) return `hoy ${clock(date, timeZone)}`;
  if (diff === 1) return 'ayer';
  return new Intl.DateTimeFormat('es', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone,
  })
    .format(date)
    .replace(/[.,]/g, '');
}

/** Fecha y hora completas para el tooltip: "martes 14 oct 2026, 14:32". */
export function formatAbsolute(iso: string, timeZone: string): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  })
    .format(date)
    .replace(/[.,]/g, '')
    .replace(/ de /g, ' ');
  return `${day}, ${clock(date, timeZone)}`;
}

/** Valor para un `<input type="datetime-local">` (`YYYY-MM-DDTHH:mm`) de un instante, en la zona dada. */
export function toLocalInput(date: Date, timeZone: string): string {
  const p = zoneParts(date, timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/**
 * Inverso de `toLocalInput`: el `datetime-local` se interpreta en la zona de Ajustes (la que usa la API para
 * agrupar los días) y se devuelve como instante ISO con `Z`. `null` si el texto no es una fecha válida.
 */
export function localInputToIso(local: string, timeZone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  let guess = wall;
  // Dos pasadas bastan incluso al cruzar un cambio de horario.
  for (let i = 0; i < 2; i += 1) {
    const p = zoneParts(new Date(guess), timeZone);
    const shown = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour),
      Number(p.minute),
    );
    guess += wall - shown;
  }
  const result = new Date(guess);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
}
