import { useId } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { CardDto, CardStatus } from 'shared';
import { COLUMN_DROP_PREFIX } from '../../lib/board';
import { cn } from '../../lib/cn';
import { Button } from '../ui/Button';
import { PlusIcon } from '../ui/icons';
import { QuickAdd } from './QuickAdd';
import { SortableCard } from './SortableCard';

interface DoneFooter {
  /** Tarjetas de Hecho (tras los filtros) que quedan fuera de la ventana de días. */
  hidden: number;
  total: number;
  days: number;
  showAll: boolean;
  onToggle: () => void;
}

interface ColumnProps {
  status: CardStatus;
  name: string;
  /** Tarjetas visibles, ya filtradas y en orden. */
  cards: CardDto[];
  /** Tarjetas de la columna sin filtrar: el contador y el WIP no dependen de los filtros. */
  count: number;
  /** Límite WIP de "En curso" (RF-13); 0 o `undefined` = sin límite. */
  wipLimit?: number;
  today: string;
  /** La columna sobre la que está el arrastre (resalta el destino). */
  highlighted: boolean;
  quickAddOpen: boolean;
  /** `false` en Bloqueado: crear ahí exige un motivo (RF-14) y no se ofrece la tarjeta rápida. */
  canQuickAdd: boolean;
  onOpenQuickAdd: () => void;
  onCloseQuickAdd: () => void;
  onCreate: (title: string) => void;
  onOpenCard: (ref: string) => void;
  doneFooter?: DoneFooter;
}

/** Columna del kanban (§4.1): sin fondo, cabecera con contador (WIP en ámbar si se supera) y `+`. */
export function Column({
  status,
  name,
  cards,
  count,
  wipLimit,
  today,
  highlighted,
  quickAddOpen,
  canQuickAdd,
  onOpenQuickAdd,
  onCloseQuickAdd,
  onCreate,
  onOpenCard,
  doneFooter,
}: ColumnProps) {
  const headingId = useId();
  const listId = useId();
  const { setNodeRef } = useDroppable({ id: `${COLUMN_DROP_PREFIX}${status}` });
  const limit = status === 'in_progress' && wipLimit ? wipLimit : 0;
  const overLimit = limit > 0 && count > limit;

  return (
    <section
      ref={setNodeRef}
      data-column={status}
      aria-labelledby={headingId}
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-md transition-colors duration-120 ease-out',
        highlighted && 'bg-primary-soft',
      )}
    >
      <header className="flex h-8 items-center gap-2">
        <h2 id={headingId} className="min-w-0 truncate text-md">
          {name}
        </h2>
        <span
          className={cn(
            'rounded-sm px-1 text-xs',
            overLimit ? 'bg-warning-soft text-warning' : 'text-fg-muted',
          )}
        >
          <span aria-hidden="true">{limit > 0 ? `${count}/${limit}` : count}</span>
          <span className="sr-only">
            {count} {count === 1 ? 'tarjeta' : 'tarjetas'}
            {limit > 0 && `, límite ${limit}`}
            {overLimit && ': límite superado'}
          </span>
        </span>
        {canQuickAdd && (
          <Button
            variant="secondary"
            iconOnly
            className="ml-auto"
            aria-label={`Nueva tarjeta en ${name}`}
            onClick={onOpenQuickAdd}
          >
            <PlusIcon />
          </Button>
        )}
      </header>
      {quickAddOpen && <QuickAdd columnName={name} onCreate={onCreate} onClose={onCloseQuickAdd} />}
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div id={listId} className="flex flex-col gap-2">
          {cards.map((card) => (
            <SortableCard key={card.id} card={card} today={today} onOpen={onOpenCard} />
          ))}
        </div>
      </SortableContext>
      {cards.length === 0 && !quickAddOpen && (
        <p className="m-0 p-6 text-center text-sm text-fg-muted">Nada aquí</p>
      )}
      {doneFooter && (doneFooter.hidden > 0 || doneFooter.showAll) && (
        <button
          type="button"
          onClick={doneFooter.onToggle}
          aria-expanded={doneFooter.showAll}
          aria-controls={listId}
          className="h-8 cursor-pointer self-start border-0 bg-transparent px-0 text-sm text-primary hover:underline"
        >
          {doneFooter.showAll
            ? `Ver solo los últimos ${doneFooter.days} días`
            : `Ver todo (${doneFooter.total})`}
        </button>
      )}
    </section>
  );
}
