import type { ReactNode } from 'react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmación de una acción destructiva (p. ej. borrar una entrada de bitácora). El foco entra en "Cancelar". */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} title={title}>
      {children && <div className="mb-4 text-base text-fg-muted">{children}</div>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" data-autofocus onClick={onCancel}>
          Cancelar
        </Button>
        <Button variant="destructive" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
