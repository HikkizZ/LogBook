import type { ComponentProps } from 'react';
import { cn } from '../../lib/cn';
import { FIELD_CLASS } from './Input';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(FIELD_CLASS, 'min-h-16 py-1 resize-y', className)} {...props} />;
}
