import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CardDto } from 'shared';
import { CardTile } from './CardTile';

interface SortableCardProps {
  card: CardDto;
  today: string;
  /** `Enter` o clic: abre la tarjeta. */
  onOpen: (ref: string) => void;
}

/** `CardTile` arrastrable (RF-11, RF-12). `Space` toma y suelta; `Enter` abre la tarjeta. */
export function SortableCard({ card, today, onOpen }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { status: card.status },
    attributes: { roleDescription: 'tarjeta arrastrable' },
  });

  return (
    <CardTile
      ref={setNodeRef}
      card={card}
      today={today}
      state={isDragging ? 'placeholder' : 'idle'}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(card.ref)}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e);
        // Durante un arrastre por teclado Enter es "soltar" (lo trata dnd-kit), no "abrir".
        if (
          e.key === 'Enter' &&
          e.target === e.currentTarget &&
          !isDragging &&
          !e.defaultPrevented
        ) {
          onOpen(card.ref);
        }
      }}
    />
  );
}
