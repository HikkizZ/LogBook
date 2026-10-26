import { useState, type FormEvent } from 'react';
import { CARD_PRIORITIES, type CardPriority, type CardStatus } from 'shared';
import { useCreateCard } from '../../api/queries';
import { COLUMNS, PRIORITY_NAME } from '../../lib/board';
import { Button } from '../ui/Button';
import { CloseIcon } from '../ui/icons';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { useToast } from '../ui/Toast';
import { LabelPicker } from './LabelPicker';

const MIN_DATE = '1970-01-01';
const MAX_DATE = '2100-12-31';

interface CardCreateProps {
  slug: string;
  titleId: string;
  onClose: () => void;
  /** La tarjeta se creó: el panel pasa a mostrarla. */
  onCreated: (ref: string) => void;
}

/**
 * Panel en modo creación (`n` y "Nueva tarjeta", Plan 4.4): título obligatorio y los metadatos de §4.2 que se
 * pueden fijar de entrada. Descripción, checklist y bitácora se completan en el detalle, que se abre al crear.
 */
export function CardCreate({ slug, titleId, onClose, onCreated }: CardCreateProps) {
  const create = useCreateCard(slug);
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [invalid, setInvalid] = useState(false);
  // TODO(diseño): Bloqueado no se ofrece al crear (RF-14 exige motivo; se crea en Por hacer y se mueve).
  const [status, setStatus] = useState<CardStatus>('todo');
  const [priority, setPriority] = useState<CardPriority>('medium');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [labels, setLabels] = useState<string[]>([]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setInvalid(true);
      return;
    }
    create.mutate(
      {
        title: trimmed,
        status,
        priority,
        labels,
        ...(startDate ? { startDate } : {}),
        ...(dueDate ? { dueDate } : {}),
      },
      {
        onSuccess: (card) => onCreated(card.ref),
        onError: (error) =>
          toast.show({ tone: 'danger', message: `No se pudo crear la tarjeta: ${error.message}` }),
      },
    );
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-border p-4">
        <h2 id={titleId} className="m-0 text-md">
          Nueva tarjeta
        </h2>
        <Button
          variant="secondary"
          iconOnly
          className="ml-auto"
          aria-label="Cerrar panel"
          onClick={onClose}
        >
          <CloseIcon />
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          Título
          <Input
            autoFocus
            maxLength={200}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? 'new-card-title-error' : undefined}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        {invalid && (
          <p id="new-card-title-error" role="alert" className="m-0 text-xs text-danger">
            El título es obligatorio.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Columna
            <Select value={status} onChange={(e) => setStatus(e.target.value as CardStatus)}>
              {COLUMNS.filter((c) => c.status !== 'blocked').map((c) => (
                <option key={c.status} value={c.status}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Prioridad
            <Select value={priority} onChange={(e) => setPriority(e.target.value as CardPriority)}>
              {CARD_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_NAME[p]}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Fecha de inicio
            <Input
              type="date"
              min={MIN_DATE}
              max={MAX_DATE}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Fecha límite
            <Input
              type="date"
              min={MIN_DATE}
              max={MAX_DATE}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
          <div role="group" aria-label="Etiquetas" className="col-span-2 flex flex-col gap-1">
            <span className="text-xs text-fg-muted">Etiquetas</span>
            <LabelPicker value={labels} onChange={setLabels} />
          </div>
        </div>
      </div>
      <footer className="flex justify-end gap-2 border-t border-border p-3">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={create.isPending}>
          Crear tarjeta
        </Button>
      </footer>
    </form>
  );
}
