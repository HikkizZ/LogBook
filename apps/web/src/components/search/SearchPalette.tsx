import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { SEARCH_MIN_LENGTH, type CardDto, type CardStatus } from 'shared';
import { useProjects } from '../../api/queries';
import { useSearch } from '../../api/search-queries';
import { STATUS_NAME } from '../../lib/board';
import { cn } from '../../lib/cn';
import { Chip } from '../ui/Chip';
import { Dialog } from '../ui/Dialog';
import { Input } from '../ui/Input';
import { Snippet } from './Snippet';

const DEBOUNCE_MS = 200;

const STATUS_DOT: Record<CardStatus, string> = {
  backlog: 'bg-border-strong',
  todo: 'bg-fg-muted',
  in_progress: 'bg-primary',
  review: 'bg-primary',
  blocked: 'bg-danger',
  done: 'bg-success',
};

interface Row {
  key: string;
  card: CardDto;
  snippet: string;
}

/**
 * Paleta de búsqueda (§4.6, RF-50..RF-52). Va dentro de un `Dialog` (foco atrapado, Esc cierra y
 * devuelve el foco). Patrón combobox/listbox con `aria-activedescendant`: el foco no sale del campo.
 * El cuerpo se desmonta al cerrar, así que cada apertura empieza vacía.
 */
export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Buscar" widthClass="max-w-dialog-wide">
      <PaletteBody onClose={onClose} />
    </Dialog>
  );
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const ids = useId();
  const listId = `${ids}-list`;
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const { data: projects } = useProjects();

  // RF-51: debounce de 200 ms. RF-52: la consulta efectiva se vacía bajo 3 caracteres.
  useEffect(() => {
    const trimmed = text.trim();
    const id = setTimeout(
      () => setQ(trimmed.length >= SEARCH_MIN_LENGTH ? trimmed : ''),
      DEBOUNCE_MS,
    );
    return () => clearTimeout(id);
  }, [text]);

  const search = useSearch(q);
  const trimmedText = text.trim();
  const tooShort = trimmedText.length < SEARCH_MIN_LENGTH;
  const data = tooShort ? undefined : search.data;
  const cards: Row[] = (data?.cards ?? []).map((r) => ({
    key: `card-${r.card.id}`,
    card: r.card,
    snippet: r.snippet,
  }));
  const entries: Row[] = (data?.entries ?? []).map((r) => ({
    key: `entry-${r.entry.id}`,
    card: r.card,
    snippet: r.snippet,
  }));
  const rows = [...cards, ...entries];
  const current = Math.min(active, rows.length - 1);
  const optionId = (i: number) => `${ids}-opt-${i}`;

  const projectName = (slug: string) => projects?.find((p) => p.slug === slug)?.name ?? slug;

  // Una entrada de bitácora abre su tarjeta; el panel arranca en la pestaña Bitácora (CardDetail).
  const openRow = (row: Row | undefined) => {
    if (!row) return;
    onClose();
    void navigate(`/p/${row.card.project}/${row.card.ref}`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (rows.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((current + step + rows.length) % rows.length);
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      openRow(rows[current]);
    }
  };

  let status: string;
  if (tooShort) status = `Escribe al menos ${SEARCH_MIN_LENGTH} caracteres.`;
  else if (search.isError) status = 'No se pudo buscar. Intenta de nuevo.';
  else if (!data || q !== trimmedText) status = 'Buscando…';
  else if (rows.length === 0) status = 'Sin resultados.';
  else status = `${rows.length} ${rows.length === 1 ? 'resultado' : 'resultados'}.`;

  const renderGroup = (label: string, group: Row[], start: number) => {
    if (group.length === 0) return null;
    const headingId = `${ids}-${label}`;
    return (
      <div role="group" aria-labelledby={headingId} key={label}>
        <div id={headingId} className="px-2 py-1 text-xs font-semibold text-fg-muted">
          {label}
        </div>
        {group.map((row, i) => {
          const index = start + i;
          return (
            <div
              key={row.key}
              id={optionId(index)}
              role="option"
              aria-selected={index === current}
              onMouseMove={() => setActive(index)}
              onClick={() => openRow(row)}
              className={cn(
                'flex cursor-pointer items-start justify-between gap-3 rounded-sm px-2 py-2',
                index === current && 'bg-surface-hover',
                row.card.archivedAt && 'opacity-60',
              )}
            >
              <div className="flex min-w-0 flex-col gap-1">
                <Snippet
                  html={row.snippet}
                  className="line-clamp-2 text-sm break-words text-fg [&_mark]:bg-primary-soft [&_mark]:font-semibold [&_mark]:text-fg"
                />
                <span className="truncate text-xs text-fg-muted">
                  <span className="font-mono">{row.card.ref}</span> · {row.card.title}
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-fg-muted">
                <span>{projectName(row.card.project)}</span>
                <span className="inline-flex items-center gap-1">
                  <span
                    aria-hidden="true"
                    className={cn('size-2 rounded-full', STATUS_DOT[row.card.status])}
                  />
                  {STATUS_NAME[row.card.status]}
                </span>
                {row.card.archivedAt && <Chip>archivada</Chip>}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div>
      <Input
        data-autofocus
        role="combobox"
        aria-label="Buscar tarjetas y bitácora"
        aria-expanded={rows.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={rows.length > 0 ? optionId(current) : undefined}
        autoComplete="off"
        placeholder="Buscar por texto o T-42"
        maxLength={200}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />
      <div
        id={listId}
        role="listbox"
        aria-label="Resultados"
        className="mt-2 max-h-96 overflow-y-auto"
      >
        {renderGroup('Tarjetas', cards, 0)}
        {renderGroup('Bitácora', entries, cards.length)}
      </div>
      <p role="status" className="mt-2 text-xs text-fg-muted">
        {status}
      </p>
    </div>
  );
}
