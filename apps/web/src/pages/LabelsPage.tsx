import { useState, type ComponentProps, type FormEvent } from 'react';
import { LABEL_COLORS, type LabelColor, type LabelDto } from 'shared';
import {
  useCreateLabel,
  useDeleteLabel,
  useLabelUsage,
  useUpdateLabel,
} from '../api/admin-queries';
import { ApiError } from '../api/client';
import { useLabels } from '../api/queries';
import { Button, Dialog, Input, Select, Skeleton } from '../components/ui';
import { PlusIcon } from '../components/ui/icons';
import { cn } from '../lib/cn';
import { isColorKey, projectDotClass } from '../lib/colors';

const COLOR_NAME: Record<LabelColor, string> = {
  violeta: 'violeta',
  magenta: 'magenta',
  cafe: 'café',
  pizarra: 'pizarra',
  turquesa: 'turquesa',
  oliva: 'oliva',
  gris: 'gris',
};

function ColorSelect({ label, ...props }: { label: string } & ComponentProps<'select'>) {
  return (
    <div className="w-40">
      <Select aria-label={label} {...props}>
        {LABEL_COLORS.map((c) => (
          <option key={c} value={c}>
            {COLOR_NAME[c]}
          </option>
        ))}
      </Select>
    </div>
  );
}

function errorText(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return 'Ya existe una etiqueta con ese nombre';
  }
  return error instanceof Error ? error.message : 'No se pudo guardar';
}

function NewLabelForm() {
  const create = useCreateLabel();
  const [name, setName] = useState('');
  const [color, setColor] = useState<LabelColor>('gris');
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Escribe un nombre');
      return;
    }
    setError('');
    create.mutate(
      { name: trimmed, color },
      { onSuccess: () => setName(''), onError: (err) => setError(errorText(err)) },
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div className="w-60">
          <Input
            aria-label="Nombre de la nueva etiqueta"
            placeholder="Nueva etiqueta"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={error ? true : undefined}
          />
        </div>
        <ColorSelect
          label="Color de la nueva etiqueta"
          value={color}
          onChange={(e) => setColor(e.target.value as LabelColor)}
        />
        <Button type="submit" disabled={create.isPending}>
          <PlusIcon /> Añadir
        </Button>
      </div>
      {error && (
        <p role="alert" className="m-0 text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

function DeleteLabelDialog({ label, onClose }: { label: LabelDto; onClose: () => void }) {
  const usage = useLabelUsage(label.name);
  const remove = useDeleteLabel();

  let impact = 'Calculando tarjetas…';
  if (usage.data) {
    const { count, more } = usage.data;
    impact =
      count === 0
        ? 'No está en ninguna tarjeta.'
        : `Se quita de ${more ? 'más de ' : ''}${count} ${count === 1 && !more ? 'tarjeta' : 'tarjetas'}.`;
  } else if (usage.isError) {
    impact = 'Se quita de todas las tarjetas que la tengan.';
  }

  return (
    <Dialog open onClose={onClose} title={`Borrar «${label.name}»`}>
      <p className="mt-0 mb-4 text-fg-muted">{impact}</p>
      {remove.error && (
        <p role="alert" className="mt-0 mb-4 text-sm text-danger">
          {remove.error.message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" data-autofocus onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant="destructive"
          disabled={remove.isPending}
          onClick={() => remove.mutate(label.id, { onSuccess: onClose })}
        >
          Borrar
        </Button>
      </div>
    </Dialog>
  );
}

function LabelRow({ label, onDelete }: { label: LabelDto; onDelete: () => void }) {
  const update = useUpdateLabel();
  const [name, setName] = useState(label.name);
  const [error, setError] = useState('');

  const saveName = () => {
    const trimmed = name.trim();
    if (trimmed === label.name) {
      setName(label.name);
      setError('');
      return;
    }
    if (!trimmed) {
      setName(label.name);
      setError('El nombre no puede estar vacío');
      return;
    }
    setError('');
    update.mutate(
      { id: label.id, name: trimmed },
      {
        onSuccess: (saved) => setName(saved.name),
        onError: (err) => {
          setError(errorText(err));
          setName(label.name);
        },
      },
    );
  };

  const color: LabelColor = isColorKey(label.color) ? label.color : 'gris';

  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cn('size-2.5 shrink-0 rounded-full', projectDotClass(label.color))}
        />
        <div className="w-60">
          <Input
            aria-label={`Nombre de la etiqueta ${label.name}`}
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setName(label.name);
            }}
            aria-invalid={error ? true : undefined}
          />
        </div>
        <ColorSelect
          label={`Color de ${label.name}`}
          value={color}
          onChange={(e) =>
            update.mutate(
              { id: label.id, color: e.target.value as LabelColor },
              { onError: (err) => setError(errorText(err)) },
            )
          }
        />
        <Button variant="destructive" aria-label={`Borrar ${label.name}`} onClick={onDelete}>
          Borrar
        </Button>
      </div>
      {error && (
        <p role="alert" className="m-0 ml-5 text-sm text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

/** Etiquetas globales (RF-23, §4.8). */
export function LabelsPage() {
  const { data: labels, isPending, error, refetch } = useLabels();
  const [deleting, setDeleting] = useState<LabelDto | null>(null);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <p className="m-0 text-fg-muted">
        Las etiquetas son globales: las usan las tarjetas de todos los proyectos.
      </p>
      <NewLabelForm />
      {isPending && <Skeleton className="h-24" />}
      {error && (
        <div role="alert" className="flex items-center gap-3">
          <p className="m-0">{error.message}</p>
          <Button variant="secondary" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      )}
      {labels && (
        <ul aria-label="Etiquetas" className="m-0 flex list-none flex-col gap-3 p-0">
          {labels.map((l) => (
            <LabelRow
              key={`${l.id}:${l.name}:${l.color}`}
              label={l}
              onDelete={() => setDeleting(l)}
            />
          ))}
        </ul>
      )}
      {labels && labels.length === 0 && <p className="m-0 text-fg-muted">Aún no hay etiquetas.</p>}
      {deleting && <DeleteLabelDialog label={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}
