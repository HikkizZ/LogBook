import { useState, type KeyboardEvent } from 'react';
import { BLOCK_REASON_MIN } from 'shared';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Textarea } from '../ui/Textarea';

interface BlockReasonDialogProps {
  /** Referencia de la tarjeta que se está bloqueando; `null` = cerrado. */
  cardRef: string | null;
  onConfirm: (reason: string) => void;
  /** Cancelar o cerrar: la tarjeta no se mueve (RF-14, §4.3). */
  onCancel: () => void;
}

/** §4.3 / RF-14: motivo obligatorio (mínimo 3 caracteres) para dejar una tarjeta en Bloqueado. */
export function BlockReasonDialog({ cardRef, onConfirm, onCancel }: BlockReasonDialogProps) {
  return (
    <Dialog
      open={cardRef !== null}
      onClose={onCancel}
      title={`¿Por qué queda bloqueada ${cardRef}?`}
    >
      {/* Se monta de nuevo en cada apertura: el texto y el error no sobreviven a un cancelar. */}
      {cardRef !== null && <ReasonForm key={cardRef} onConfirm={onConfirm} onCancel={onCancel} />}
    </Dialog>
  );
}

function ReasonForm({
  onConfirm,
  onCancel,
}: Pick<BlockReasonDialogProps, 'onConfirm' | 'onCancel'>) {
  const [reason, setReason] = useState('');
  const [invalid, setInvalid] = useState(false);

  const submit = () => {
    const trimmed = reason.trim();
    if (trimmed.length < BLOCK_REASON_MIN) {
      setInvalid(true);
      return;
    }
    onConfirm(trimmed);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <>
      <p id="block-reason-hint" className="m-0 mb-2 text-xs text-fg-muted">
        Mínimo {BLOCK_REASON_MIN} caracteres; queda en la bitácora como entrada de bloqueo.
      </p>
      <Textarea
        aria-label="Motivo del bloqueo"
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? 'block-reason-error' : 'block-reason-hint'}
        data-autofocus
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {invalid && (
        <p id="block-reason-error" role="alert" className="mt-1 text-xs text-danger">
          Escribe al menos {BLOCK_REASON_MIN} caracteres.
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button variant="destructive" onClick={submit}>
          Bloquear
        </Button>
      </div>
    </>
  );
}
