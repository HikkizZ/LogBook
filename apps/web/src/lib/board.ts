import { cardPrioritySchema, type CardDto, type CardPriority, type CardStatus } from 'shared';

/** Las seis columnas fijas, en orden (RF-10). */
export const COLUMNS: { status: CardStatus; name: string }[] = [
  { status: 'backlog', name: 'Backlog' },
  { status: 'todo', name: 'Por hacer' },
  { status: 'in_progress', name: 'En curso' },
  { status: 'review', name: 'Revisión' },
  { status: 'blocked', name: 'Bloqueado' },
  { status: 'done', name: 'Hecho' },
];

export const STATUS_NAME = Object.fromEntries(COLUMNS.map((c) => [c.status, c.name])) as Record<
  CardStatus,
  string
>;

export const PRIORITY_NAME: Record<CardPriority, string> = {
  urgent: 'Urgente',
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

/** Prefijo del id de las columnas como zona de soltado (los de las tarjetas son sus uuid). */
export const COLUMN_DROP_PREFIX = 'col:';

export type CardsByStatus = Record<CardStatus, CardDto[]>;

/** Tarjetas por columna, en el orden de `position` (desempate por número, como la API). */
export function groupByStatus(cards: CardDto[]): CardsByStatus {
  const grouped = Object.fromEntries(
    COLUMNS.map((c) => [c.status, [] as CardDto[]]),
  ) as CardsByStatus;
  for (const card of cards) grouped[card.status].push(card);
  for (const column of COLUMNS) {
    grouped[column.status].sort((a, b) => a.position - b.position || a.number - b.number);
  }
  return grouped;
}

// ---------------------------------------------------------------------------------------------
// Filtros (RF-18): viven en la URL y se aplican sobre las tarjetas ya cargadas.

export interface BoardFilters {
  label: string;
  priority: CardPriority | '';
  q: string;
}

export function parseFilters(params: URLSearchParams): BoardFilters {
  const priority = cardPrioritySchema.safeParse(params.get('priority'));
  return {
    label: params.get('label')?.trim() ?? '',
    priority: priority.success ? priority.data : '',
    q: params.get('q')?.trim() ?? '',
  };
}

export function hasFilters(f: BoardFilters): boolean {
  return f.label !== '' || f.priority !== '' || f.q !== '';
}

/** Minúsculas y sin tildes: "migracion" encuentra "Migración". */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function matchesFilters(card: CardDto, f: BoardFilters): boolean {
  if (f.label && !card.labels.some((l) => l.name.toLowerCase() === f.label.toLowerCase())) {
    return false;
  }
  if (f.priority && card.priority !== f.priority) return false;
  if (f.q && !normalize(`${card.ref} ${card.title}`).includes(normalize(f.q))) return false;
  return true;
}

// ---------------------------------------------------------------------------------------------
// Columna Hecho (RF-17).

/** Hechas en los últimos `days` días. Sin `completedAt` (recién movida) cuenta como reciente. */
export function isRecentlyDone(card: CardDto, days: number, nowMs: number): boolean {
  if (!card.completedAt) return true;
  return Date.parse(card.completedAt) >= nowMs - days * 86_400_000;
}

// ---------------------------------------------------------------------------------------------
// Movimientos.

/**
 * Copia de la lista con la tarjeta ya movida, como lo dejará la API: `position` es el índice final en
 * la columna destino (omitido o mayor que el tamaño = al final) y las columnas tocadas quedan en `0..n-1`.
 */
export function applyMove(
  cards: CardDto[],
  move: { ref: string; status: CardStatus; position?: number },
  nowIso: string = new Date().toISOString(),
): CardDto[] {
  const moving = cards.find((c) => c.ref === move.ref);
  if (!moving) return cards;
  const grouped = groupByStatus(cards);
  const changedColumn = moving.status !== move.status;

  const destination = grouped[move.status].filter((c) => c.id !== moving.id);
  const index = Math.min(move.position ?? destination.length, destination.length);
  destination.splice(index, 0, {
    ...moving,
    status: move.status,
    completedAt: !changedColumn ? moving.completedAt : move.status === 'done' ? nowIso : null,
  });

  const source = changedColumn ? grouped[moving.status].filter((c) => c.id !== moving.id) : [];
  const touched = new Set([moving.id, ...source.map((c) => c.id), ...destination.map((c) => c.id)]);
  return [
    ...cards.filter((c) => !touched.has(c.id)),
    ...destination.map((c, i) => ({ ...c, position: i })),
    ...source.map((c, i) => ({ ...c, position: i })),
  ];
}

/** Añade una tarjeta recién creada al final de su columna (sin duplicarla si ya llegó por una recarga). */
export function appendCard(cards: CardDto[], card: CardDto): CardDto[] {
  return cards.some((c) => c.id === card.id) ? cards : [...cards, card];
}

export interface DropTarget {
  status: CardStatus;
  /** Índice final en la columna completa (con las tarjetas ocultas por filtros o por la ventana de Hecho). */
  position?: number;
}

/**
 * Destino de un soltado. `overId` es una tarjeta o una columna (`col:<estado>`).
 *
 * El índice se calcula sobre la columna **completa**, no sobre la visible: con filtros activos o con
 * tarjetas viejas ocultas en Hecho, el índice visible no coincide con el `position` de la API.
 * Misma columna: el índice final es el de la tarjeta sobre la que se suelta (semántica de `arrayMove`).
 * Otra columna: se inserta antes de la tarjeta, o después si se suelta en su mitad inferior.
 */
export function resolveDrop(
  cards: CardDto[],
  activeId: string,
  overId: string,
  after: boolean,
): DropTarget | null {
  if (!cards.some((c) => c.id === activeId)) return null;
  if (overId.startsWith(COLUMN_DROP_PREFIX)) {
    return { status: overId.slice(COLUMN_DROP_PREFIX.length) as CardStatus };
  }
  if (overId === activeId) return null;
  const active = cards.find((c) => c.id === activeId);
  const over = cards.find((c) => c.id === overId);
  if (!active || !over) return null;
  const overIndex = groupByStatus(cards)[over.status].findIndex((c) => c.id === over.id);
  if (over.status === active.status) return { status: over.status, position: overIndex };
  return { status: over.status, position: overIndex + (after ? 1 : 0) };
}

/** ¿El soltado deja la tarjeta donde estaba? */
export function isNoop(cards: CardDto[], activeId: string, target: DropTarget): boolean {
  const active = cards.find((c) => c.id === activeId);
  if (!active || active.status !== target.status) return false;
  const column = groupByStatus(cards)[active.status];
  const current = column.findIndex((c) => c.id === active.id);
  return (target.position ?? column.length - 1) === current;
}
