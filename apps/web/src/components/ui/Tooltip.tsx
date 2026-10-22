import { useEffect, useId, useState, type HTMLAttributes, type ReactNode } from 'react';

interface TooltipProps {
  label: string;
  /** Lado donde aparece. `right` para los iconos de la sidebar colapsada. */
  side?: 'top' | 'right';
  /** Recibe `aria-describedby` y los manejadores; hay que esparcirlos sobre el elemento que se anota. */
  children: (triggerProps: HTMLAttributes<HTMLElement>) => ReactNode;
}

const DELAY_MS = 300;

/** §5: aparece al pasar el ratón (300 ms de retardo) y con el foco del teclado; Esc la cierra. */
export function Tooltip({ label, side = 'top', children }: TooltipProps) {
  const id = useId();
  const [pending, setPending] = useState<{ el: HTMLElement; delay: number } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => {
      const r = pending.el.getBoundingClientRect();
      setPos(
        side === 'right'
          ? { x: r.right + 8, y: r.top + r.height / 2 }
          : { x: r.left + r.width / 2, y: r.top - 8 },
      );
    }, pending.delay);
    return () => clearTimeout(timer);
  }, [pending, side]);

  const hide = () => {
    setPending(null);
    setPos(null);
  };

  return (
    <>
      {children({
        'aria-describedby': id,
        onMouseEnter: (e) => setPending({ el: e.currentTarget, delay: DELAY_MS }),
        onMouseLeave: hide,
        onFocus: (e) => setPending({ el: e.currentTarget, delay: 0 }),
        onBlur: hide,
        onKeyDown: (e) => {
          if (e.key === 'Escape') hide();
        },
      })}
      <span
        id={id}
        role="tooltip"
        hidden={!pos}
        style={
          pos
            ? {
                left: pos.x,
                top: pos.y,
                transform: side === 'right' ? 'translateY(-50%)' : 'translate(-50%, -100%)',
              }
            : undefined
        }
        className="pointer-events-none fixed z-70 rounded-sm bg-fg px-2 py-1 text-xs whitespace-nowrap text-surface"
      >
        {label}
      </span>
    </>
  );
}
