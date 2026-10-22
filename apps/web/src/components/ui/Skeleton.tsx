import type { ComponentProps } from 'react';
import { cn } from '../../lib/cn';

/** Bloque gris de carga (§5). Decorativo: oculto a los lectores de pantalla. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-skeleton rounded-sm bg-surface-hover', className)}
      {...props}
    />
  );
}
