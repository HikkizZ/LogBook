import type { ComponentProps } from 'react';
import type { CardDto, CardPriority, CardStatus } from 'shared';
import { cn } from '../../lib/cn';
import { isColorKey } from '../../lib/colors';
import { dueInfo, type DueTone } from '../../lib/dates';
import { Chip } from '../ui/Chip';
import { CalendarIcon, ClockIcon } from '../ui/icons';

/** Barra de estado de 3 px a la izquierda (§2.2). Revisión lleva la barra discontinua. */
const STATUS_BAR: Record<CardStatus, string> = {
  backlog: 'border-l-border',
  todo: 'border-l-fg-muted',
  in_progress: 'border-l-primary',
  review: 'border-l-primary [border-left-style:dashed]',
  blocked: 'border-l-danger',
  done: 'border-l-success',
};

const DUE_TONE: Record<DueTone, string> = {
  overdue: 'text-danger',
  soon: 'text-warning',
  normal: 'text-fg-muted',
  done: 'text-fg-muted',
};

/** Punto de prioridad (§4.1): `medium` no lleva punto. */
const PRIORITY_DOT: Partial<Record<CardPriority, { className: string; label: string }>> = {
  urgent: { className: 'bg-danger', label: 'Prioridad urgente' },
  high: { className: 'bg-warning', label: 'Prioridad alta' },
  low: { className: 'bg-fg-muted', label: 'Prioridad baja' },
};

const MAX_LABELS = 2;

export type CardTileState = 'idle' | 'placeholder' | 'overlay';

interface CardTileProps extends Omit<ComponentProps<'div'>, 'children'> {
  card: CardDto;
  /** Hoy (`YYYY-MM-DD`) en la zona de Ajustes: de ahí sale la urgencia de la fecha límite. */
  today: string;
  /** `placeholder`: hueco que deja la tarjeta mientras se arrastra; `overlay`: la tarjeta en el aire (§5). */
  state?: CardTileState;
}

/**
 * Tarjeta del kanban (§4.1): ID, etiquetas, título a 2 líneas y una fila con fecha límite, checklist y
 * prioridad. La descripción no se muestra aquí. Recibe `ref` y el resto de props para que el tablero
 * le ponga encima los atributos de dnd-kit.
 */
export function CardTile({ card, today, state = 'idle', className, ...props }: CardTileProps) {
  const done = card.status === 'done';
  const due = card.dueDate ? dueInfo(card.dueDate, today, done) : null;
  const priority = PRIORITY_DOT[card.priority];
  const hasChecklist = card.checklistTotal > 0;
  const extraLabels = card.labels.length - MAX_LABELS;

  return (
    <div
      data-card-ref={card.ref}
      className={cn(
        'flex flex-col gap-1 rounded-md border p-3 text-left transition-shadow duration-120 ease-out',
        state === 'placeholder'
          ? 'border-dashed border-border-strong bg-transparent'
          : cn(
              'border-border border-l-3 bg-surface shadow-card',
              STATUS_BAR[card.status],
              state === 'idle' &&
                'cursor-grab hover:border-y-fg-muted hover:border-r-fg-muted hover:shadow-lift focus-visible:border-y-primary focus-visible:border-r-primary',
              state === 'overlay' &&
                'rotate-1 cursor-grabbing opacity-90 shadow-lift motion-reduce:rotate-0',
              card.archivedAt && 'opacity-60',
            ),
        className,
      )}
      {...props}
    >
      <div className={cn('flex flex-col gap-1', state === 'placeholder' && 'invisible')}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs text-fg-muted">{card.ref}</span>
          {card.labels.length > 0 && (
            <span className="flex min-w-0 items-center gap-1 overflow-hidden">
              {card.labels.slice(0, MAX_LABELS).map((l) => (
                <Chip
                  key={l.name}
                  color={isColorKey(l.color) ? l.color : 'gris'}
                  className="min-w-0 truncate"
                >
                  {l.name}
                </Chip>
              ))}
              {extraLabels > 0 && (
                <Chip>
                  <span aria-hidden="true">+{extraLabels}</span>
                  <span className="sr-only">{extraLabels} etiquetas más</span>
                </Chip>
              )}
            </span>
          )}
        </div>
        <p className="m-0 line-clamp-2 text-sm break-words text-fg">{card.title}</p>
        {(due || hasChecklist || priority) && (
          <div className="mt-1 flex items-center gap-3 text-xs text-fg-muted">
            {due && (
              <span className={cn('inline-flex items-center gap-1', DUE_TONE[due.tone])}>
                {due.tone === 'normal' || due.tone === 'done' ? (
                  <CalendarIcon width={12} height={12} />
                ) : (
                  <ClockIcon width={12} height={12} />
                )}
                {due.text}
              </span>
            )}
            {hasChecklist && (
              <span>
                <span aria-hidden="true">
                  {card.checklistDone}/{card.checklistTotal}
                </span>
                <span className="sr-only">
                  Checklist: {card.checklistDone} de {card.checklistTotal}
                </span>
              </span>
            )}
            {priority && (
              <span className="ml-auto inline-flex items-center">
                <span
                  aria-hidden="true"
                  className={cn('size-2 shrink-0 rounded-full', priority.className)}
                />
                <span className="sr-only">{priority.label}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
