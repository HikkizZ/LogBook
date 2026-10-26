import { useEffect, useId, useRef, useState } from 'react';
import type { LabelColor, LabelDto } from 'shared';
import { useLabels } from '../../api/queries';
import { cn } from '../../lib/cn';
import { isColorKey } from '../../lib/colors';
import { Checkbox } from '../ui/Checkbox';
import { Chip } from '../ui/Chip';
import { ChevronDownIcon } from '../ui/icons';

interface LabelPickerProps {
  /** Nombres de las etiquetas elegidas. */
  value: string[];
  onChange: (names: string[]) => void;
  /** Etiquetas de la tarjeta, para pintar el chip aunque la etiqueta ya no figure en la lista. */
  current?: { name: string; color: string }[];
}

/**
 * Multi-select de etiquetas (§5): un botón con los chips elegidos que abre una lista de casillas. Cada casilla
 * es un checkbox nativo (teclado y lector sin trabajo extra) y la elegida lleva el fondo `primary-soft`.
 * `Esc` cierra la lista sin cerrar el panel.
 * TODO(diseño): §5 habla de un listbox propio; se usan casillas nativas por teclado y lector de pantalla gratis.
 */
export function LabelPicker({ value, onChange, current = [] }: LabelPickerProps) {
  const labels = useLabels();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const options: Pick<LabelDto, 'name' | 'color'>[] = [...(labels.data ?? [])];
  for (const c of current) {
    if (!options.some((o) => o.name.toLowerCase() === c.name.toLowerCase())) options.push(c);
  }
  const colorOf = (name: string): LabelColor => {
    const color = options.find((o) => o.name === name)?.color ?? 'gris';
    return isColorKey(color) ? color : 'gris';
  };

  const toggle = (name: string, checked: boolean) =>
    onChange(checked ? [...value, name] : value.filter((n) => n !== name));

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
          buttonRef.current?.focus();
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-8 w-full cursor-pointer flex-wrap items-center gap-1 rounded-sm border border-border-strong bg-surface py-1 pr-8 pl-2 text-left text-base text-fg enabled:hover:border-fg-muted"
      >
        {value.length === 0 ? (
          <span className="text-fg-placeholder italic">Sin etiquetas</span>
        ) : (
          value.map((name) => (
            <Chip key={name} color={colorOf(name)}>
              {name}
            </Chip>
          ))
        )}
        <span className="sr-only">Editar etiquetas</span>
        <ChevronDownIcon className="pointer-events-none absolute top-2 right-2 text-fg-muted" />
      </button>
      {open && (
        <div
          id={listId}
          role="group"
          aria-label="Etiquetas"
          className="absolute top-full right-0 left-0 z-10 mt-1 max-h-60 overflow-auto rounded-md border border-border bg-surface py-1 shadow-lift"
        >
          {options.length === 0 && (
            <p className="m-0 px-3 py-1 text-sm text-fg-muted">No hay etiquetas todavía.</p>
          )}
          {options.map((o) => {
            const checked = value.includes(o.name);
            return (
              <Checkbox
                key={o.name}
                className={cn('w-full px-3', checked && 'bg-primary-soft')}
                checked={checked}
                onChange={(e) => toggle(o.name, e.target.checked)}
                label={
                  <Chip color={isColorKey(o.color) ? o.color : 'gris'}>
                    <span>{o.name}</span>
                  </Chip>
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
