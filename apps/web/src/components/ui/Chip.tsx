import type { ComponentProps } from 'react';
import type { LabelColor } from 'shared';
import { COLOR_KEY_CHIP_CLASS } from '../../lib/colors';
import { cn } from '../../lib/cn';

export type ChipTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONE: Record<ChipTone, string> = {
  neutral: 'bg-surface-hover text-neutral',
  info: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

interface ChipProps extends ComponentProps<'span'> {
  /** Estado o aviso. Se ignora si hay `color`. */
  tone?: ChipTone;
  /** Clave de color de proyecto o etiqueta (§2.3, §2.4). */
  color?: LabelColor;
}

export function Chip({ tone = 'neutral', color, className, ...props }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-sm px-2 text-xs whitespace-nowrap',
        color ? COLOR_KEY_CHIP_CLASS[color] : TONE[tone],
        className,
      )}
      {...props}
    />
  );
}
