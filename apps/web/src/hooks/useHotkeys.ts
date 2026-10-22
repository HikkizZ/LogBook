import { useEffect, useRef } from 'react';

/**
 * Atajos globales (§6.2). Claves: una tecla (`n`, `?`, `[`, `/`), una secuencia con espacio (`g d`)
 * o un acorde con `ctrl+` (`ctrl+k`). Los atajos sin Ctrl no se activan con el foco en un campo de
 * texto ni con un modal abierto; `ctrl+k` sí funciona escribiendo.
 */
export type Hotkeys = Record<string, (e: KeyboardEvent) => void>;

const SEQUENCE_TIMEOUT_MS = 1000;

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable;
}

export function useHotkeys(hotkeys: Hotkeys): void {
  const latest = useRef(hotkeys);
  useEffect(() => {
    latest.current = hotkeys;
  });

  useEffect(() => {
    let first: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reset = () => {
      first = null;
      clearTimeout(timer);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // AltGr (teclados latinoamericano y español: `[` es AltGr+') llega como ctrl+alt a la vez.
      const altGr = e.ctrlKey && e.altKey;
      if (e.defaultPrevented || e.isComposing || (e.altKey && !altGr)) return;
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      const table = latest.current;
      const ctrl = (e.ctrlKey || e.metaKey) && !altGr;
      // Bloq Mayús entrega `N` sin Shift: las letras se comparan en minúscula salvo con Shift real.
      const key = !e.shiftKey && e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const typing = isEditable(e.target);
      const modal = document.querySelector('[aria-modal="true"]') !== null;

      if (ctrl) {
        const handler = table[`ctrl+${e.key.toLowerCase()}`];
        if (handler && !modal) {
          e.preventDefault();
          handler(e);
        }
        return;
      }
      if (typing || modal) return reset();

      const pending = first;
      reset();
      const handler = pending ? table[`${pending} ${key}`] : table[key];
      if (handler) {
        e.preventDefault();
        handler(e);
      } else if (!pending && Object.keys(table).some((k) => k.startsWith(`${key} `))) {
        first = key;
        timer = setTimeout(reset, SEQUENCE_TIMEOUT_MS);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      reset();
    };
  }, []);
}
