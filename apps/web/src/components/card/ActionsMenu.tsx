import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '../ui/Button';
import { MoreIcon } from './card-icons';

interface ActionsMenuProps {
  archived: boolean;
  onMove: () => void;
  onToggleArchive: () => void;
}

const ITEM =
  'flex h-8 w-full cursor-pointer items-center px-3 text-left text-base text-fg hover:bg-surface-hover focus-visible:bg-surface-hover';

/** Menú `⋯` del panel (§4.2): mover a otro proyecto y archivar (RF-27, RF-28). Patrón WAI-ARIA `menu`. */
export function ActionsMenu({ archived, onMove, onToggleArchive }: ActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const items = () =>
    Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.stopPropagation();
      close(true);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      list[(index + step + list.length) % list.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      list[e.key === 'Home' ? 0 : list.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <Button
        ref={buttonRef}
        variant="secondary"
        iconOnly
        aria-label="Más acciones"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreIcon />
      </Button>
      {open && (
        <div
          role="menu"
          aria-label="Acciones de la tarjeta"
          className="absolute top-full right-0 z-10 mt-1 w-56 rounded-md border border-border bg-surface py-1 shadow-lift"
        >
          <button
            type="button"
            role="menuitem"
            className={ITEM}
            onClick={() => {
              close(true);
              onMove();
            }}
          >
            Mover a otro proyecto…
          </button>
          <button
            type="button"
            role="menuitem"
            className={ITEM}
            onClick={() => {
              close(true);
              onToggleArchive();
            }}
          >
            {archived ? 'Desarchivar tarjeta' : 'Archivar tarjeta'}
          </button>
        </div>
      )}
    </div>
  );
}
