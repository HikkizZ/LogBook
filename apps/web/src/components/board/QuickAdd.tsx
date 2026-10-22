import { useState, type KeyboardEvent } from 'react';
import { Input } from '../ui/Input';

interface QuickAddProps {
  columnName: string;
  /** Crea la tarjeta; el campo se vacía al instante y queda listo para la siguiente (RF-26). */
  onCreate: (title: string) => void;
  onClose: () => void;
}

/** Tarjeta rápida (RF-26, §4.1): `Enter` crea y deja otro campo, `Esc` cancela. */
export function QuickAdd({ columnName, onCreate, onClose }: QuickAddProps) {
  const [title, setTitle] = useState('');

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const trimmed = title.trim();
      if (!trimmed) return;
      onCreate(trimmed);
      setTitle('');
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Input
        aria-label={`Título de la nueva tarjeta en ${columnName}`}
        placeholder="Título de la tarjeta"
        maxLength={200}
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (!title.trim()) onClose();
        }}
      />
      <p className="m-0 text-xs text-fg-muted">Enter crea otra · Esc cancela</p>
    </div>
  );
}
