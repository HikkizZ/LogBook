import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { CheckIcon } from './icons';

interface CheckboxProps extends Omit<ComponentProps<'input'>, 'type'> {
  label: ReactNode;
}

export function Checkbox({ label, className, disabled, ...props }: CheckboxProps) {
  return (
    <label
      className={cn(
        'inline-flex min-h-8 items-center gap-2 text-base text-fg',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className,
      )}
    >
      <span className="relative inline-flex size-4 shrink-0">
        <input
          type="checkbox"
          disabled={disabled}
          className="peer size-4 cursor-[inherit] appearance-none rounded-sm border border-border-strong bg-surface transition-colors duration-120 ease-out enabled:hover:border-primary checked:border-primary checked:bg-primary"
          {...props}
        />
        <CheckIcon
          width={12}
          height={12}
          strokeWidth={2}
          className="pointer-events-none absolute top-0.5 left-0.5 hidden text-surface peer-checked:block"
        />
      </span>
      {label}
    </label>
  );
}
