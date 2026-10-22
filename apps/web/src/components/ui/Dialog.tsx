import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Título visible; es el nombre accesible del diálogo (`aria-labelledby`). */
  title: string;
  children: ReactNode;
  /** Ancho máximo en clases de Tailwind. Por defecto 420 px (§4.3). */
  widthClass?: string;
}

/**
 * Modal con foco atrapado (§5, §6.1): Tab y Shift+Tab ciclan dentro, Esc cierra, el foco entra al
 * abrir (primer elemento con `data-autofocus`, si no el primero enfocable) y vuelve al cerrar.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  widthClass = 'max-w-dialog',
}: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
    (dialog.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0] ?? dialog).focus();

    // Red de seguridad: si el foco escapa (clic fuera, script), vuelve adentro.
    // Los avisos (toasts) se montan encima del diálogo y deben poder enfocarse.
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as Element;
      if (dialog.contains(target) || target.closest('[role="region"][aria-label="Avisos"]')) return;
      (focusables()[0] ?? dialog).focus();
    };
    document.addEventListener('focusin', onFocusIn);
    // Sin scroll del fondo mientras el diálogo está abierto (CSSOM: compatible con la CSP).
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) {
      e.preventDefault();
      return;
    }
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === ref.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cn('w-full rounded-md bg-surface p-6 text-fg shadow-lift', widthClass)}
      >
        <h2 id={titleId} className="mb-4 text-md">
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
