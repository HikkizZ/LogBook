import type { CardDto, CardStatus } from 'shared';
import { COLUMNS } from '../../lib/board';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';

interface MoveToDialogProps {
  /** Tarjeta enfocada que se quiere mover; `null` = cerrado. */
  card: CardDto | null;
  onSelect: (status: CardStatus) => void;
  onClose: () => void;
}

/** Menú "Mover a…" (`m`, §6.2): la alternativa al arrastre; la tarjeta va al final de la columna elegida. */
export function MoveToDialog({ card, onSelect, onClose }: MoveToDialogProps) {
  const first = COLUMNS.find((c) => c.status !== card?.status)?.status;
  return (
    <Dialog open={card !== null} onClose={onClose} title={`Mover ${card?.ref ?? ''} a…`}>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {COLUMNS.map((c) => {
          const current = c.status === card?.status;
          return (
            <li key={c.status}>
              <Button
                variant="secondary"
                className="w-full justify-start"
                disabled={current}
                aria-current={current || undefined}
                data-autofocus={c.status === first || undefined}
                onClick={() => onSelect(c.status)}
              >
                {c.name}
                {current && <span className="text-xs text-fg-muted">(columna actual)</span>}
              </Button>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </Dialog>
  );
}
