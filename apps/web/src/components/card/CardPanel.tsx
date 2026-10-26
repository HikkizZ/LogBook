import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { CardCreate } from './CardCreate';
import { CardDetail } from './CardDetail';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface CardPanelProps {
  slug: string;
  /** Tarjeta abierta (`T-42`), o `null` para el modo creación. */
  cardRef: string | null;
  onClose: () => void;
  /** En modo creación: la tarjeta se creó. */
  onCreated: (ref: string) => void;
  /** La tarjeta vive en otro proyecto que el de la URL. */
  onProjectChanged: (slug: string) => void;
}

/**
 * Panel lateral de la tarjeta (§3, §4.2, §6.1): 480 px superpuestos al kanban (a todo el ancho bajo 1024 px),
 * `role="dialog"` con foco atrapado, `Esc` o clic fuera lo cierran y al cerrar el foco vuelve a la tarjeta del
 * tablero. La URL (`/p/:slug/:ref`) la gobierna quien lo monta.
 */
export function CardPanel({ slug, cardRef, onClose, onCreated, onProjectChanged }: CardPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // La tarjeta que tenga el panel al cerrarse (si se creó una nueva, esa): a su ficha vuelve el foco.
  const lastRef = useRef(cardRef);
  useEffect(() => {
    lastRef.current = cardRef;
  }, [cardRef]);

  // Quién tenía el foco al abrir: se lee al renderizar, antes de que un campo con `autoFocus` se lo quite.
  const [previous] = useState(() => document.activeElement as HTMLElement | null);
  // Al cerrar, el foco vuelve a la tarjeta del kanban (o, si no hay, a quien lo tenía al abrir).
  useEffect(() => {
    return () => {
      const tile = lastRef.current
        ? document.querySelector<HTMLElement>(`[data-card-ref="${lastRef.current}"]`)
        : null;
      (tile ?? previous)?.focus();
    };
  }, [previous]);

  // Al abrir, y al pasar de "nueva" a la tarjeta creada, el foco entra al panel si ningún campo lo tiene.
  useEffect(() => {
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus();
  }, [cardRef]);

  // `Esc` cierra. Los diálogos, menús y editores que usan `Esc` para sí lo detienen antes de llegar aquí.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Red de seguridad del foco atrapado: lo que quede fuera vuelve dentro (los diálogos y avisos pueden tenerlo).
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as Element;
      if (target.closest('[role="dialog"], [role="region"][aria-label="Avisos"]')) return;
      const panel = panelRef.current;
      (panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus();
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const panel = panelRef.current;
    // Los eventos de un diálogo montado desde el panel burbujean por React hasta aquí: no son del panel.
    if (e.key !== 'Tab' || !panel || !panel.contains(e.target as Node)) return;
    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) {
      e.preventDefault();
      return;
    }
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <>
      {/* Sin velo: el panel se superpone, no oscurece. El clic fuera lo cierra. */}
      <div className="fixed inset-0 z-40" aria-hidden="true" onMouseDown={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="fixed inset-y-0 right-0 z-40 flex w-full flex-col bg-surface text-fg shadow-lift focus-visible:outline-none lg:w-panel"
      >
        {cardRef === null ? (
          <CardCreate slug={slug} titleId={titleId} onClose={onClose} onCreated={onCreated} />
        ) : (
          <CardDetail
            slug={slug}
            cardRef={cardRef}
            titleId={titleId}
            onClose={onClose}
            onProjectChanged={onProjectChanged}
          />
        )}
      </div>
    </>,
    document.body,
  );
}
