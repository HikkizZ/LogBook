import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';
import { Button } from './Button';
import { CloseIcon } from './icons';

export type ToastTone = 'success' | 'danger';

export interface ToastOptions {
  tone: ToastTone;
  message: string;
  /** Acción opcional, p. ej. "Reintentar" tras un error de red (§5). Un toast con acción no se cierra solo. */
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends ToastOptions {
  id: number;
}

const DURATION_MS = 4000;

export function Toast({ tone, message, action, onClose }: ToastOptions & { onClose: () => void }) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex w-80 items-start gap-2 rounded-md border border-l-3 border-border bg-surface p-3 text-base text-fg shadow-lift',
        tone === 'success' ? 'border-l-success' : 'border-l-danger',
      )}
    >
      <p className="m-0 flex-1">{message}</p>
      {action && (
        <Button
          variant="secondary"
          onClick={() => {
            action.onClick();
            onClose();
          }}
        >
          {action.label}
        </Button>
      )}
      <Button variant="secondary" iconOnly aria-label="Cerrar aviso" onClick={onClose}>
        <CloseIcon />
      </Button>
    </div>
  );
}

function AutoDismiss({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, DURATION_MS);
    return () => clearTimeout(t);
  }, [onClose]);
  return null;
}

const ToastContext = createContext<{ show: (t: ToastOptions) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((t: ToastOptions) => {
    setItems((prev) => [...prev, { ...t, id: Date.now() + Math.random() }]);
  }, []);
  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);
  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          role="region"
          aria-label="Avisos"
          className="fixed right-4 bottom-4 z-60 flex flex-col items-end gap-2"
        >
          {items.map((t) => (
            <ToastEntry key={t.id} item={t} onDismiss={dismiss} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

function ToastEntry({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const close = useCallback(() => onDismiss(item.id), [onDismiss, item.id]);
  return (
    <>
      <Toast {...item} onClose={close} />
      {!item.action && <AutoDismiss onClose={close} />}
    </>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast requiere <ToastProvider>');
  return ctx;
}
