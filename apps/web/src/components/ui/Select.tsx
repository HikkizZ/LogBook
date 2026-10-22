import type { ComponentProps } from 'react';
import { cn } from '../../lib/cn';
import { FIELD_CLASS } from './Input';
import { ChevronDownIcon } from './icons';

/**
 * Select nativo (accesible por teclado y lector de pantalla sin trabajo extra) con chevron propio.
 * Se queda nativo en v1: la lista desplegable del navegador no admite el ítem resaltado en
 * primary-soft, y un listbox propio costaría más (teclado, anuncios) de lo que aporta.
 */
export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <span className="relative inline-flex w-full">
      <select className={cn(FIELD_CLASS, 'h-8 appearance-none pr-8', className)} {...props}>
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute top-2 right-2 text-fg-muted" />
    </span>
  );
}
