import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Input } from '../ui/Input';

interface TitleEditorProps {
  title: string;
  /** `id` del `h2`: es el nombre accesible del panel (`aria-labelledby`). */
  titleId: string;
  onSave: (title: string) => void;
}

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable;
}

/**
 * Título editable en línea (§4.2): clic o `e` para editar, `Enter` o `Ctrl+Enter` guardan, `Esc` cancela y
 * salir del campo guarda. Un título vacío no se guarda (la API exige 1..200 caracteres, RF-21).
 */
export function TitleEditor({ title, titleId, onSave }: TitleEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  // `true` cuando la edición ya terminó (guardar o cancelar): el `blur` del campo que se desmonta no guarda otra vez.
  const finished = useRef(true);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);

  const start = () => {
    finished.current = false;
    setDraft(title);
    setEditing(true);
  };

  // `e` edita el título (§6.2) salvo escribiendo en un campo o con otro diálogo encima del panel.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'e' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      if (isEditable(e.target) || document.querySelectorAll('[aria-modal="true"]').length > 1) {
        return;
      }
      e.preventDefault();
      finished.current = false;
      setDraft(title);
      setEditing(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [title]);

  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false;
      buttonRef.current?.focus();
    }
  }, [editing]);

  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    refocus.current = true;
    setEditing(false);
    const next = draft.trim();
    if (save && next && next !== title) onSave(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      finish(false);
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      finish(true);
    }
  };

  return (
    <h2 id={titleId} className="m-0 text-md text-fg">
      {editing ? (
        <Input
          aria-label="Título de la tarjeta"
          maxLength={200}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => finish(true)}
        />
      ) : (
        <button
          ref={buttonRef}
          type="button"
          title="Editar título (e)"
          onClick={start}
          className="-mx-1 block w-full cursor-text rounded-sm px-1 text-left text-md font-semibold break-words text-fg hover:bg-surface-hover"
        >
          {title}
        </button>
      )}
    </h2>
  );
}
