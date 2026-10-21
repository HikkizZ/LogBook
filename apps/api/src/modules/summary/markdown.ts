import type { LogEntryDto, LogGroupsDto } from 'shared';
import type { CardStatus } from '../../entities/index.js';
import { COLUMN_NAME } from '../cards/move.service.js';

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const;

/** Número de semana ISO 8601 de una fecha `YYYY-MM-DD`. */
export function isoWeek(date: string): number {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3); // jueves de esa semana
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  return 1 + Math.round((t.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}

/** `mar 21`: día de la semana y número del día, de una fecha `YYYY-MM-DD` (sin zona: ya es local). */
function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`;
}

const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();

interface CardAcc {
  ref: string;
  title: string;
  /** Notas y demás entradas escritas, en orden cronológico. */
  parts: string[];
  /** Columnas recorridas por las entradas `moved` (`Por hacer → En curso`) y día del último movimiento. */
  path: string[];
  movedOn: string;
}

function movePath(entry: LogEntryDto): [CardStatus, CardStatus] | null {
  const { from, to } = entry.metadata as { from?: CardStatus; to?: CardStatus };
  return from && to && from in COLUMN_NAME && to in COLUMN_NAME ? [from, to] : null;
}

/**
 * Resumen en markdown (RF-43) a partir de la misma estructura de `GET /log`.
 *
 * ```
 * ## Semana 43 — 2026-10-19 a 2026-10-25
 *
 * ### SIGA
 *
 * - **T-42** Título — avancé X, quedó Y (mar 21); Por hacer → En curso (mié 22)
 * ```
 *
 * TODO(spec): el ejemplo de la spec no cubre varios días ni entradas de sistema; se eligió: una línea por
 * tarjeta con sus entradas escritas en orden (cada una con su día), `blocked` con prefijo "Bloqueado: ", y al
 * final el recorrido de columnas de las entradas `moved` con el día del último movimiento. Un día suelto
 * se titula `## Día <fecha>`; sin entradas, `_Sin actividad en el período._`.
 */
export function renderSummary(range: { from: string; to: string }, log: LogGroupsDto): string {
  const header =
    range.from === range.to
      ? `## Día ${range.from}`
      : `## Semana ${isoWeek(range.from)} — ${range.from} a ${range.to}`;

  // proyecto (por nombre) → tarjeta (por primera aparición) acumulando entradas de todos los días.
  const projects = new Map<string, { name: string; cards: Map<string, CardAcc> }>();
  for (const day of log.days) {
    for (const { project, cards } of day.projects) {
      const group = projects.get(project.id) ?? { name: project.name, cards: new Map() };
      projects.set(project.id, group);
      for (const { card, entries } of cards) {
        const acc: CardAcc = group.cards.get(card.id) ?? {
          ref: card.ref,
          title: oneLine(card.title),
          parts: [],
          path: [],
          movedOn: day.date,
        };
        group.cards.set(card.id, acc);
        for (const entry of entries) {
          const moved = entry.kind === 'moved' ? movePath(entry) : null;
          if (moved) {
            if (acc.path.length === 0) acc.path.push(COLUMN_NAME[moved[0]]);
            acc.path.push(COLUMN_NAME[moved[1]]);
            acc.movedOn = day.date;
          } else {
            const text = oneLine(entry.body);
            const prefix = entry.kind === 'blocked' ? 'Bloqueado: ' : '';
            acc.parts.push(`${prefix}${text} (${dayLabel(day.date)})`);
          }
        }
      }
    }
  }

  const blocks = [header];
  if (projects.size === 0) blocks.push('_Sin actividad en el período._');
  for (const { name, cards } of [...projects.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const lines = [...cards.values()].map((c) => {
      const parts = [...c.parts];
      if (c.path.length > 0) parts.push(`${c.path.join(' → ')} (${dayLabel(c.movedOn)})`);
      return `- **${c.ref}** ${c.title} — ${parts.join('; ')}`;
    });
    blocks.push(`### ${name}`, lines.join('\n'));
  }
  return `${blocks.join('\n\n')}\n`;
}
