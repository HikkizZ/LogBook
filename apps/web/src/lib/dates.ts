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
