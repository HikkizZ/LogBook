import { useState, type KeyboardEvent } from 'react';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { Markdown } from './Markdown';

const MAX_DESCRIPTION = 20000;

interface DescriptionTabProps {
  description: string;
  saving: boolean;
  /** Guarda y llama a `onDone` cuando la API aceptó el cambio. */
  onSave: (description: string, onDone: () => void) => void;
}

/** Pestaña Descripción (RF-21, RF-22): markdown renderizado; "Editar" abre un textarea con vista previa (no WYSIWYG). */
export function DescriptionTab({ description, saving, onSave }: DescriptionTabProps) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-3 flex justify-end">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Editar descripción
          </Button>
        </div>
        {description.trim() ? (
          <Markdown source={description} />
        ) : (
          <p className="m-0 text-base text-fg-muted">Sin descripción.</p>
        )}
      </div>
    );
  }

  return (
    <DescriptionEditor
      initial={description}
      saving={saving}
      onCancel={() => setEditing(false)}
      onSave={(text) => onSave(text, () => setEditing(false))}
    />
  );
}

function DescriptionEditor({
  initial,
  saving,
  onCancel,
  onSave,
}: {
  initial: string;
  saving: boolean;
  onCancel: () => void;
  onSave: (text: string) => void;
}) {
  const [draft, setDraft] = useState(initial);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSave(draft);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <label className="flex flex-col gap-1 text-sm text-fg-muted">
        Descripción (markdown)
        <Textarea
          className="min-h-40 font-mono text-sm"
          maxLength={MAX_DESCRIPTION}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </label>
      {/* TODO(diseño): §4.2 dice "vista previa al lado"; en 480 px dos columnas quedan de ~200 px, así que va debajo. */}
      <section aria-label="Vista previa" className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-fg-muted">Vista previa</h3>
        <div className="min-h-16 rounded-sm border border-border bg-bg p-3">
          {draft.trim() ? (
            <Markdown source={draft} />
          ) : (
            <p className="m-0 text-base text-fg-muted">Nada que mostrar todavía.</p>
          )}
        </div>
      </section>
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-xs text-fg-muted">Ctrl+Enter guarda</span>
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button disabled={saving} onClick={() => onSave(draft)}>
          Guardar
        </Button>
      </div>
    </div>
  );
}
