import { useState } from 'react';

/**
 * Preferencia de interfaz (booleana) recordada en `localStorage`. Solo para comodidad de la UI, como el
 * colapso de la sidebar: nunca para autenticación (ADR 0001). Sin almacenamiento disponible dura la pestaña.
 */
export function usePersistedBoolean(
  key: string,
  initial: boolean,
): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? initial : stored === '1';
    } catch {
      return initial;
    }
  });

  const update = (next: boolean) => {
    setValue(next);
    try {
      localStorage.setItem(key, next ? '1' : '0');
    } catch {
      // Sin almacenamiento: la preferencia solo vive mientras la pestaña esté abierta.
    }
  };
  return [value, update];
}
