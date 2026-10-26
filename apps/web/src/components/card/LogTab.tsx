import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { LogEntryDto, LogKind } from 'shared';
import {
  useAddLogEntry,
  useCardLog,
  useDeleteLogEntry,
  useEditLogEntry,
} from '../../api/card-queries';
import { useSettings } from '../../api/queries';
import { usePersistedBoolean } from '../../hooks/usePersistedBoolean';
import { cn } from '../../lib/cn';
import { formatAbsolute, formatLogTime, localInputToIso, toLocalInput } from '../../lib/dates';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { Input } from '../ui/Input';
import { Skeleton } from '../ui/Skeleton';
import { Textarea } from '../ui/Textarea';
import { Tooltip } from '../ui/Tooltip';
import { ArrowRightIcon, CommitIcon } from './card-icons';
import { ConfirmDialog } from './ConfirmDialog';
import { Markdown } from './Markdown';

/** Preferencia de interfaz (RF-33): recordada en el navegador, nada que ver con la sesión. */
const ONLY_NOTES_KEY = 'logbook.logOnlyNotes';
const SYSTEM_KINDS: readonly LogKind[] = ['moved', 'commit', 'pr'];
const MAX_BODY = 5000;

const isSystem = (e: LogEntryDto) => SYSTEM_KINDS.includes(e.kind);

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Pestaña Bitácora (§4.2, RF-30..RF-33): cronología ascendente, entradas de sistema atenuadas y cuadro al pie. */
export function LogTab({ cardRef }: { cardRef: string }) {
  const log = useCardLog(cardRef);
  const settings = useSettings();
  const timeZone = settings.data?.timezone ?? browserTimeZone();
  const [onlyNotes, setOnlyNotes] = usePersistedBoolean(ONLY_NOTES_KEY, false);
  const listRef = useRef<HTMLDivElement>(null);

  const entries = (log.data ?? []).filter((e) => !onlyNotes || !isSystem(e));

  // Lo más nuevo abajo, como un chat: al llegar una entrada se baja hasta ella.
  const count = entries.length;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between px-4 pt-2">
        <Checkbox
          label="Solo mis notas"
          checked={onlyNotes}
          onChange={(e) => setOnlyNotes(e.target.checked)}
        />
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
        {log.isPending && <Skeleton className="mt-2 h-16" />}
        {log.isError && (
          <div role="alert" className="mt-2 flex flex-col items-start gap-2">
            <p className="m-0 text-base text-fg">No se pudo cargar la bitácora.</p>
            <Button variant="secondary" onClick={() => void log.refetch()}>
              Reintentar
            </Button>
          </div>
        )}
        {log.data && entries.length === 0 && (
          <p className="mt-2 text-base text-fg-muted">
            {onlyNotes && log.data.length > 0
              ? 'No hay notas escritas a mano.'
              : 'Sin entradas todavía.'}
          </p>
        )}
        {entries.length > 0 && (
          <ol aria-label="Bitácora" className="m-0 flex list-none flex-col gap-3 p-0 pt-2">
            {entries.map((entry) => (
              <li key={entry.id} className="m-0">
                {isSystem(entry) ? (
                  <SystemEntry entry={entry} timeZone={timeZone} />
                ) : (
                  <NoteEntry entry={entry} timeZone={timeZone} />
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
      <Composer cardRef={cardRef} timeZone={timeZone} />
    </div>
  );
}

function EntryTime({ iso, timeZone }: { iso: string; timeZone: string }) {
  return (
    <Tooltip label={formatAbsolute(iso, timeZone)} describe={false}>
      {(trigger) => (
        <time dateTime={iso} className="text-xs text-fg-muted" {...trigger}>
          {formatLogTime(iso, timeZone)}
        </time>
      )}
    </Tooltip>
  );
}

/** `moved`, `commit` y `pr`: una línea atenuada con icono (§4.2). */
function SystemEntry({ entry, timeZone }: { entry: LogEntryDto; timeZone: string }) {
  return (
    <p className="m-0 flex items-center gap-2 text-sm text-fg-muted">
      {entry.kind === 'moved' ? (
        <ArrowRightIcon width={12} height={12} className="shrink-0" />
      ) : (
        <CommitIcon width={12} height={12} className="shrink-0" />
      )}
      <span className="min-w-0 flex-1 break-words">{entry.body}</span>
      <EntryTime iso={entry.occurredAt} timeZone={timeZone} />
    </p>
  );
}

/**
 * `note` y `blocked`: se pueden editar y borrar (RF-32).
 * TODO(diseño): RF-32 permite borrar también las de sistema; la UI no lo ofrece (el plan habla de "notas propias").
 */
function NoteEntry({ entry, timeZone }: { entry: LogEntryDto; timeZone: string }) {
  const edit = useEditLogEntry();
  const remove = useDeleteLogEntry();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.body);
  const [confirming, setConfirming] = useState(false);

  const save = () => {
    const body = draft.trim();
    if (!body) return;
    if (body === entry.body) {
      setEditing(false);
      return;
    }
    edit.mutate({ entry, body }, { onSuccess: () => setEditing(false) });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setEditing(false);
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save();
    }
  };

  const blocked = entry.kind === 'blocked';
  return (
    <div className="group rounded-md border border-border bg-surface p-3">
      <div className="mb-1 flex items-center gap-2">
        {blocked && (
          <span className="inline-flex items-center gap-1 text-xs text-danger">
            <span aria-hidden="true" className="size-2 rounded-full bg-danger" />
            Bloqueado
          </span>
        )}
        <EntryTime iso={entry.occurredAt} timeZone={timeZone} />
        {!editing && (
          <span
            className={cn(
              'ml-auto flex gap-1 opacity-0 transition-opacity duration-120',
              'group-focus-within:opacity-100 group-hover:opacity-100',
            )}
          >
            <Button
              variant="secondary"
              aria-label="Editar entrada"
              onClick={() => {
                setDraft(entry.body);
                setEditing(true);
              }}
            >
              Editar
            </Button>
            <Button
              variant="destructive"
              aria-label="Borrar entrada"
              onClick={() => setConfirming(true)}
            >
              Borrar
            </Button>
          </span>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea
            aria-label="Editar entrada"
            maxLength={MAX_BODY}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            <Button disabled={!draft.trim() || edit.isPending} onClick={save}>
              Guardar
            </Button>
          </div>
        </div>
      ) : (
        <Markdown source={entry.body} />
      )}
      <ConfirmDialog
        open={confirming}
        title="¿Borrar esta entrada?"
        confirmLabel="Borrar"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          remove.mutate(entry);
        }}
      >
        Se quita de la bitácora de {entry.cardRef}. No se puede deshacer.
      </ConfirmDialog>
    </div>
  );
}

/** Cuadro al pie (RF-31): `Ctrl+Enter` guarda; "otra fecha" permite registrar algo de ayer (RF-30). */
function Composer({ cardRef, timeZone }: { cardRef: string; timeZone: string }) {
  const add = useAddLogEntry();
  const [body, setBody] = useState('');
  const [otherDate, setOtherDate] = useState(false);
  const [when, setWhen] = useState('');
  const textRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const text = body.trim();
    if (!text || add.isPending) return;
    const occurredAt = otherDate && when ? localInputToIso(when, timeZone) : null;
    add.mutate(
      { ref: cardRef, body: text, ...(occurredAt ? { occurredAt } : {}) },
      {
        onSuccess: () => {
          setBody('');
          setOtherDate(false);
          textRef.current?.focus();
        },
      },
    );
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form
      className="shrink-0 border-t border-border bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Textarea
        ref={textRef}
        aria-label="Nueva entrada de bitácora"
        placeholder="Avancé… / quedó…"
        maxLength={MAX_BODY}
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="mt-2 flex items-center gap-2">
        {/* TODO(diseño): "otra fecha" usa fecha y hora (datetime-local), no solo fecha, para registrar "ayer a las 16:00". */}
        <button
          type="button"
          aria-expanded={otherDate}
          className="cursor-pointer text-sm text-primary underline"
          onClick={() => {
            if (!otherDate) setWhen(toLocalInput(new Date(), timeZone));
            setOtherDate((v) => !v);
          }}
        >
          {otherDate ? 'Usar ahora' : 'Otra fecha'}
        </button>
        {otherDate && (
          <Input
            type="datetime-local"
            aria-label="Fecha y hora de la entrada"
            min="1970-01-01T00:00"
            max="2100-12-31T23:59"
            className="w-auto"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        )}
        <Button type="submit" className="ml-auto" disabled={!body.trim() || add.isPending}>
          Guardar
        </Button>
      </div>
      <p className="m-0 mt-1 text-xs text-fg-muted">Ctrl+Enter guarda</p>
    </form>
  );
}
