import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ChecklistItemDto } from 'shared';
import {
  useAddChecklistItem,
  useDeleteChecklistItem,
  useUpdateChecklistItem,
} from '../../api/card-queries';
import { cn } from '../../lib/cn';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { Input } from '../ui/Input';
import { GripIcon, TrashIcon } from './card-icons';

const MAX_TEXT = 300;

const SCREEN_READER_INSTRUCTIONS =
  'Para reordenar pulsa Espacio sobre el asa, muévelo con las flechas arriba y abajo y suéltalo con Espacio. Escape cancela.';

/** Pestaña Checklist (RF-24, §4.2): marcar, editar el texto en línea, reordenar con dnd-kit y agregar al pie. */
export function ChecklistTab({ cardRef, items }: { cardRef: string; items: ChecklistItemDto[] }) {
  const add = useAddChecklistItem(cardRef);
  const update = useUpdateChecklistItem(cardRef);
  const remove = useDeleteChecklistItem(cardRef);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const textOf = (id: string | number) => items.find((i) => i.id === id)?.text ?? 'ítem';
  const placeOf = (id: string | number) => items.findIndex((i) => i.id === id) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `"${textOf(active.id)}" tomado, posición ${placeOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `"${textOf(active.id)}" sobre la posición ${placeOf(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      `"${textOf(active.id)}" soltado en la posición ${placeOf(over?.id ?? active.id)}.`,
    onDragCancel: ({ active }) => `Movimiento cancelado. "${textOf(active.id)}" sigue en su sitio.`,
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const position = items.findIndex((i) => i.id === over.id);
    if (position >= 0) update.mutate({ id: String(active.id), position });
  };

  const submit = () => {
    const value = text.trim();
    if (!value || add.isPending) return;
    add.mutate(value, {
      onSuccess: () => {
        setText('');
        inputRef.current?.focus();
      },
    });
  };

  const done = items.filter((i) => i.done).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {items.length > 0 && (
          <p className="m-0 mb-2 text-sm text-fg-muted">
            {done} de {items.length} hechos
          </p>
        )}
        {items.length === 0 && <p className="m-0 text-base text-fg-muted">Sin ítems todavía.</p>}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          accessibility={{
            announcements,
            screenReaderInstructions: { draggable: SCREEN_READER_INSTRUCTIONS },
          }}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <ul aria-label="Ítems del checklist" className="m-0 flex list-none flex-col p-0">
              {items.map((item) => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  onToggle={(checked) => update.mutate({ id: item.id, done: checked })}
                  onRename={(value) => update.mutate({ id: item.id, text: value })}
                  onRemove={() =>
                    // La fila quitada se lleva el botón que tenía el foco: pasa al campo de agregar.
                    remove.mutate(item.id, { onSuccess: () => inputRef.current?.focus() })
                  }
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </div>
      <div className="shrink-0 border-t border-border bg-surface p-3">
        <Input
          ref={inputRef}
          aria-label="Agregar ítem"
          placeholder="Agregar ítem…"
          maxLength={MAX_TEXT}
          disabled={add.isPending}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
      </div>
    </div>
  );
}

interface RowProps {
  item: ChecklistItemDto;
  onToggle: (done: boolean) => void;
  onRename: (text: string) => void;
  onRemove: () => void;
}

function ChecklistRow({ item, onToggle, onRename, onRemove }: RowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, attributes: { roleDescription: 'ítem reordenable' } });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const finished = useRef(true);
  const textButton = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);

  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    refocus.current = true;
    setEditing(false);
    const value = draft.trim();
    if (save && value && value !== item.text) onRename(value);
  };

  // El botón del texto vuelve a existir al terminar la edición: el foco no se pierde.
  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false;
      textButton.current?.focus();
    }
  }, [editing]);

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
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-1 rounded-sm bg-surface',
        isDragging && 'relative z-10 shadow-lift',
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`Reordenar "${item.text}"`}
        className="flex size-8 shrink-0 cursor-grab items-center justify-center rounded-sm text-fg-muted hover:bg-surface-hover"
        {...attributes}
        {...listeners}
      >
        <GripIcon />
      </button>
      <Checkbox
        label={<span className="sr-only">{`Marcar "${item.text}"`}</span>}
        checked={item.done}
        onChange={(e) => onToggle(e.target.checked)}
      />
      {editing ? (
        <Input
          aria-label="Texto del ítem"
          maxLength={MAX_TEXT}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => finish(true)}
        />
      ) : (
        <button
          ref={textButton}
          type="button"
          title="Editar texto"
          className={cn(
            'min-h-8 min-w-0 flex-1 cursor-text rounded-sm px-1 text-left text-base break-words hover:bg-surface-hover',
            item.done ? 'text-fg-muted line-through' : 'text-fg',
          )}
          onClick={() => {
            finished.current = false;
            setDraft(item.text);
            setEditing(true);
          }}
        >
          {item.text}
        </button>
      )}
      <Button variant="secondary" iconOnly aria-label={`Quitar "${item.text}"`} onClick={onRemove}>
        <TrashIcon />
      </Button>
    </li>
  );
}
