import type { ComponentProps } from 'react';
import { cn } from '../../lib/cn';

export const FIELD_CLASS =
  'w-full rounded-sm border border-border-strong bg-surface px-2 text-base text-fg transition-colors duration-120 ease-out enabled:hover:border-fg-muted focus:border-primary disabled:cursor-not-allowed disabled:bg-bg disabled:text-fg-muted aria-invalid:border-danger';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(FIELD_CLASS, 'h-8', className)} {...props} />;
}
