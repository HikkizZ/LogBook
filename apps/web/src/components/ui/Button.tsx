import type { ComponentProps } from 'react';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive';

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'border border-transparent bg-primary text-surface enabled:hover:bg-primary-hover enabled:active:translate-y-0 enabled:active:bg-primary-hover',
  secondary:
    'border border-border-strong bg-surface text-fg enabled:hover:bg-surface-hover enabled:active:border-primary',
  destructive:
    'border border-danger bg-surface text-danger enabled:hover:bg-danger-soft focus-visible:outline-danger',
};

type ButtonProps = ComponentProps<'button'> & {
  variant?: ButtonVariant;
} & (
    | {
        /** Botón cuadrado de 32 px solo con icono: exige `aria-label` (§6.1). */
        iconOnly: true;
        'aria-label': string;
      }
    | { iconOnly?: false }
  );

export function Button({
  variant = 'primary',
  iconOnly = false,
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex h-8 cursor-pointer items-center justify-center gap-2 rounded-sm text-base font-medium whitespace-nowrap transition-colors duration-120 ease-out disabled:cursor-not-allowed disabled:opacity-50',
        iconOnly ? 'w-8 px-0' : 'px-3',
        VARIANT[variant],
        className,
      )}
      {...props}
    />
  );
}
