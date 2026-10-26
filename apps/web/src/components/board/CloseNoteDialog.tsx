import { useState, type KeyboardEvent } from 'react';
import { useAddLogEntry } from '../../api/card-queries';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Textarea } from '../ui/Textarea';

const MAX_BODY = 5000;

interface CloseNoteDialogProps {
  /** Tarjeta que acaba de pasar a Hecho; `null` = cerrado. */
  cardRef: string | null;
  onClose: () => void;
}

/** RF-34: al cerrar una tarjeta (pasarla a Hecho) se ofrece escribir "qué quedó". Es opcional: "Omitir". */
export function CloseNoteDialog({ cardRef, onClose }: CloseNoteDialogProps) {
  return (
    <Dialog open={cardRef !== null} onClose={onClose} title={`¿Qué quedó en ${cardRef}?`}>
      {/* Se monta de nuevo en cada apertura: el texto no sobrevive a un "Omitir". */}
      {cardRef !== null && <CloseNoteForm key={cardRef} cardRef={cardRef} onClose={onClose} />}
    </Dialog>
  );
}

function CloseNoteForm({ cardRef, onClose }: { cardRef: string; onClose: () => void }) {
  const add = useAddLogEntry();
  const [body, setBody] = useState('');

  const save = () => {
    const text = body.trim();
    if (!text || add.isPending) return;
    add.mutate({ ref: cardRef, body: text }, { onSuccess: onClose });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save();
    }
  };

  return (
    <>
      <p className="m-0 mb-2 text-xs text-fg-muted">
        Opcional: queda en la bitácora como una nota más.
      </p>
      <Textarea
        aria-label="Entrada de cierre"
        data-autofocus
        maxLength={MAX_BODY}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Omitir
        </Button>
        <Button disabled={!body.trim() || add.isPending} onClick={save}>
          Guardar nota
        </Button>
      </div>
    </>
  );
}
