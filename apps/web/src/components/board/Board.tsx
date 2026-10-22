import { useEffect, useMemo, useRef, useState } from 'react';
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useNavigate } from 'react-router';
import type { CardDto, CardStatus } from 'shared';
import { ApiError } from '../../api/client';
import { useCreateCard, useMoveCard } from '../../api/queries';
import { useHotkeys } from '../../hooks/useHotkeys';
import {
  BOARD_GRID_CLASS,
  COLUMN_DROP_PREFIX,
  COLUMNS,
  groupByStatus,
  isNoop,
  isRecentlyDone,
  matchesFilters,
  resolveDrop,
  STATUS_NAME,
  type BoardFilters,
  type DropTarget,
} from '../../lib/board';
import { useToast } from '../ui/Toast';
import { BlockReasonDialog } from './BlockReasonDialog';
import { CardTile } from './CardTile';
import { Column } from './Column';
import { MoveToDialog } from './MoveToDialog';

interface BoardProps {
  slug: string;
  /** Todas las tarjetas activas del proyecto, sin filtrar. */
  cards: CardDto[];
  filters: BoardFilters;
  /** Límite WIP del proyecto (RF-13); 0 = sin límite. */
  wipLimit: number;
  /** `doneDaysVisible` de Ajustes (RF-17). */
  doneDaysVisible: number;
  today: string;
  /** Instante de referencia de la ventana de Hecho. */
  nowMs: number;
  quickAddStatus: CardStatus | null;
  onQuickAddStatusChange: (status: CardStatus | null) => void;
}

const SCREEN_READER_INSTRUCTIONS =
  'Para tomar una tarjeta pulsa Espacio. Muévela con las flechas y suéltala con Espacio o Enter. Escape cancela.';

/** Con el puntero manda la tarjeta (o columna) bajo él; con teclado no hay puntero y se usa la cercanía. */
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length === 0) return closestCorners(args);
  const card = hits.find((h) => !String(h.id).startsWith(COLUMN_DROP_PREFIX));
  return card ? [card] : hits;
};

function statusOfDroppable(id: string | number | undefined, cards: CardDto[]): CardStatus | null {
  if (id === undefined) return null;
  const key = String(id);
  if (key.startsWith(COLUMN_DROP_PREFIX)) return key.slice(COLUMN_DROP_PREFIX.length) as CardStatus;
  return cards.find((c) => c.id === key)?.status ?? null;
}

/**
 * Tablero de seis columnas con arrastre (RF-10, RF-11, RF-12), tarjeta rápida (RF-26), diálogo de
 * bloqueo (RF-14) y navegación con `j/k/h/l`, `Enter` y `m` (§6.2).
 */
export function Board({
  slug,
  cards,
  filters,
  wipLimit,
  doneDaysVisible,
  today,
  nowMs,
  quickAddStatus,
  onQuickAddStatusChange,
}: BoardProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const move = useMoveCard(slug);
  const create = useCreateCard(slug);
  const rootRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);
  // Las altas se encadenan: dos `Enter` seguidos llegan a la API en orden y la columna conserva el suyo.
  const createQueue = useRef<Promise<unknown>>(Promise.resolve());

  const [activeId, setActiveId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<CardStatus | null>(null);
  const [showAllDone, setShowAllDone] = useState(false);
  const [blocking, setBlocking] = useState<{ ref: string; position?: number } | null>(null);
  const [movingRef, setMovingRef] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Espacio toma y suelta; Enter también suelta, pero abrir la tarjeta es cosa de `SortableCard`.
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );

  const grouped = useMemo(() => groupByStatus(cards), [cards]);
  const visible = useMemo(() => {
    const result = {} as Record<CardStatus, CardDto[]>;
    for (const { status } of COLUMNS) {
      let list = grouped[status].filter((c) => matchesFilters(c, filters));
      if (status === 'done' && !showAllDone) {
        list = list.filter((c) => isRecentlyDone(c, doneDaysVisible, nowMs));
      }
      result[status] = list;
    }
    return result;
  }, [grouped, filters, showAllDone, doneDaysVisible, nowMs]);
  const doneFilteredTotal = useMemo(
    () => grouped.done.filter((c) => matchesFilters(c, filters)).length,
    [grouped, filters],
  );

  const activeCard = activeId ? (cards.find((c) => c.id === activeId) ?? null) : null;
  const movingCard = movingRef ? (cards.find((c) => c.ref === movingRef) ?? null) : null;

  // Tras mover, la tarjeta se monta en otra columna y el foco se perdería: se le devuelve.
  useEffect(() => {
    const ref = pendingFocus.current;
    if (!ref) return;
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-card-ref="${ref}"]`);
    if (el) {
      el.focus();
      pendingFocus.current = null;
    }
  }, [cards]);

  /** Único camino de movimiento (arrastre y menú `m`): pide el motivo si hace falta, si no mueve. */
  const requestMove = (card: CardDto, target: DropTarget) => {
    if (target.status === 'blocked' && card.status !== 'blocked') {
      setBlocking({ ref: card.ref, position: target.position });
      return;
    }
    pendingFocus.current = card.ref;
    move.mutate({ ref: card.ref, status: target.status, position: target.position });
  };

  const confirmBlock = (reason: string) => {
    if (!blocking) return;
    pendingFocus.current = blocking.ref;
    move.mutate({ ref: blocking.ref, status: 'blocked', position: blocking.position, reason });
    setBlocking(null);
  };

  const createCard = (status: CardStatus, title: string) => {
    const run = () =>
      create.mutateAsync({ title, status }).catch((error: Error) => {
        toast.show({
          tone: 'danger',
          message: `No se pudo crear "${title}": ${error.message}`,
          action:
            error instanceof ApiError && error.status === 0
              ? { label: 'Reintentar', onClick: () => createCard(status, title) }
              : undefined,
        });
      });
    createQueue.current = createQueue.current.then(run);
  };

  const openCard = (ref: string) => {
    // TODO(fase 5): abrir el panel de detalle (CardPanel) en vez de navegar a la página provisional.
    void navigate(`/p/${slug}/${ref}`);
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragOver = (e: DragOverEvent) => setOverStatus(statusOfDroppable(e.over?.id, cards));
  const clearDrag = () => {
    setActiveId(null);
    setOverStatus(null);
  };
  const onDragEnd = (e: DragEndEvent) => {
    clearDrag();
    if (!e.over) return;
    const activeId = String(e.active.id);
    const translated = e.active.rect.current.translated;
    const after = translated
      ? translated.top + translated.height / 2 > e.over.rect.top + e.over.rect.height / 2
      : false;
    const target = resolveDrop(cards, activeId, String(e.over.id), after);
    const card = cards.find((c) => c.id === activeId);
    if (!target || !card || isNoop(cards, activeId, target)) return;
    requestMove(card, target);
  };

  function refOf(id: string | number): string {
    return cards.find((c) => c.id === id)?.ref ?? 'Tarjeta';
  }

  /** "En curso, posición 2" o "la columna Hecho". */
  function describePlace(id: string | number | undefined): string | null {
    const status = statusOfDroppable(id, cards);
    if (!status) return null;
    const index = visible[status].findIndex((c) => c.id === id);
    return index >= 0
      ? `${STATUS_NAME[status]}, posición ${index + 1}`
      : `la columna ${STATUS_NAME[status]}`;
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => `${refOf(active.id)} tomada.`,
    onDragOver: ({ active, over }) => {
      // Al tomar la tarjeta dnd-kit ya la da por "sobre" sí misma: no se repite tras "tomada".
      if (over?.id === active.id) return undefined;
      const where = describePlace(over?.id);
      return where
        ? `${refOf(active.id)} sobre ${where}.`
        : `${refOf(active.id)} fuera de las columnas.`;
    },
    onDragEnd: ({ active, over }) => {
      const where = describePlace(over?.id);
      return where
        ? `${refOf(active.id)} soltada en ${where}.`
        : `${refOf(active.id)} soltada, sin cambios.`;
    },
    onDragCancel: ({ active }) => `Movimiento cancelado. ${refOf(active.id)} sigue en su sitio.`,
  };

  // §6.2: j/k/h/l recorren las tarjetas, m abre "Mover a…". useHotkeys ya ignora campos de texto y modales.
  const focusNeighbour = (dRow: number, dCol: number) => {
    const columns = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>('[data-column]') ?? [],
    ).map((col) => Array.from(col.querySelectorAll<HTMLElement>('[data-card-ref]')));
    const current = document.activeElement?.closest<HTMLElement>('[data-card-ref]');
    let colIndex = columns.findIndex((list) => current && list.includes(current));
    let row = colIndex >= 0 ? (columns[colIndex]?.indexOf(current as HTMLElement) ?? 0) : -1;
    if (colIndex < 0) {
      colIndex = columns.findIndex((list) => list.length > 0);
      columns[colIndex]?.[0]?.focus();
      return;
    }
    if (dCol !== 0) {
      // Salta las columnas vacías y conserva la fila (acotada) en la que cae.
      let next = colIndex + dCol;
      while (columns[next] && columns[next]?.length === 0) next += dCol;
      if (!columns[next]) return;
      colIndex = next;
      row = Math.min(row, (columns[next]?.length ?? 1) - 1);
    } else {
      row += dRow;
    }
    columns[colIndex]?.[row]?.focus();
  };

  useHotkeys({
    // Con una tarjeta tomada el teclado es del arrastre: ni mover el foco ni abrir "Mover a…".
    j: () => activeId === null && focusNeighbour(1, 0),
    k: () => activeId === null && focusNeighbour(-1, 0),
    h: () => activeId === null && focusNeighbour(0, -1),
    l: () => activeId === null && focusNeighbour(0, 1),
    m: () => {
      if (activeId !== null) return;
      const ref = document.activeElement?.closest<HTMLElement>('[data-card-ref]')?.dataset.cardRef;
      if (ref) setMovingRef(ref);
    },
  });

  return (
    <div ref={rootRef}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: SCREEN_READER_INSTRUCTIONS },
        }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={clearDrag}
      >
        <div className={`${BOARD_GRID_CLASS} overflow-x-auto`}>
          {COLUMNS.map(({ status, name }) => (
            <Column
              key={status}
              status={status}
              name={name}
              cards={visible[status]}
              count={grouped[status].length}
              wipLimit={wipLimit}
              today={today}
              highlighted={activeId !== null && overStatus === status}
              quickAddOpen={quickAddStatus === status}
              canQuickAdd={status !== 'blocked'}
              onOpenQuickAdd={() => onQuickAddStatusChange(status)}
              onCloseQuickAdd={() => onQuickAddStatusChange(null)}
              onCreate={(title) => createCard(status, title)}
              onOpenCard={openCard}
              doneFooter={
                status === 'done'
                  ? {
                      hidden: doneFilteredTotal - visible.done.length,
                      total: doneFilteredTotal,
                      days: doneDaysVisible,
                      showAll: showAllDone,
                      onToggle: () => setShowAllDone((v) => !v),
                    }
                  : undefined
              }
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeCard && <CardTile card={activeCard} today={today} state="overlay" />}
        </DragOverlay>
      </DndContext>
      <BlockReasonDialog
        cardRef={blocking?.ref ?? null}
        onConfirm={confirmBlock}
        onCancel={() => setBlocking(null)}
      />
      <MoveToDialog
        card={movingCard}
        onClose={() => setMovingRef(null)}
        onSelect={(status) => {
          if (movingCard) {
            // Desde el menú no hay posición: va al final de la columna elegida.
            requestMove(movingCard, { status });
          }
          setMovingRef(null);
        }}
      />
    </div>
  );
}
