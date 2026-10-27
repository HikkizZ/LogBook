import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { CardStatus, LogEntryDto } from 'shared';
import { ApiError, isUnauthorized } from '../../api/client';
import { fetchSummary, useLogView, type LogFilters, type LogView } from '../../api/log-queries';
import { useProjects, useSettings } from '../../api/queries';
import { STATUS_NAME, STATUS_TONE } from '../../lib/board';
import { cn } from '../../lib/cn';
import { projectDotClass } from '../../lib/colors';
import { clock, formatShortDate, todayIn } from '../../lib/dates';
import {
  addDays,
  formatDayHeading,
  formatLongDate,
  isoWeek,
  mondayOf,
  weekRange,
} from '../../lib/week';
import { Markdown } from '../card/Markdown';
import { CopyIcon } from '../card/card-icons';
import { Button, Chip, Select, Skeleton, Textarea, useToast } from '../ui';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from '../ui/icons';

export type LogViewMode = 'day' | 'week';

const FEEDBACK_MS = 1500;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `?date=YYYY-MM-DD` válido o `null` (entonces manda "hoy"). */
function parseDate(value: string | null): string | null {
  if (!value || !DATE_RE.test(value)) return null;
  return Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? null : value;
}

/** "19 oct – 25 oct"; con año ("28 dic 2026 – 3 ene 2027") si cruza de año o no es el actual. */
function formatRange({ from, to }: { from: string; to: string }, today: string): string {
  const year = from.slice(0, 4);
  const withYear = year !== to.slice(0, 4) || year !== today.slice(0, 4);
  const format = (date: string) =>
    withYear ? `${formatShortDate(date)} ${date.slice(0, 4)}` : formatShortDate(date);
  return `${format(from)} – ${format(to)}`;
}

/**
 * Mi día (`/today`) y Mi semana (`/week`), §4.4, sobre `GET /log`. El estado vive en la URL:
 * `?date=YYYY-MM-DD` (cualquier día de la semana en Mi semana) y `?project=<slug>` (RF-44).
 */
export function LogViewScreen({ mode }: { mode: LogViewMode }) {
  const [params, setParams] = useSearchParams();
  const settings = useSettings();
  const projects = useProjects();

  if (settings.isPending) return <LogSkeleton />;
  if (settings.isError) return <LoadError message="No se pudieron cargar los ajustes." />;

  const today = todayIn(settings.data.timezone);
  const date = parseDate(params.get('date')) ?? today;
  const project = params.get('project');
  const range = mode === 'day' ? { from: date, to: date } : weekRange(date);
  const filters: LogFilters = { ...range, project };

  const update = (changes: { date?: string | null; project?: string | null }) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next);
  };

  const step = mode === 'day' ? 1 : 7;
  const isCurrent = mode === 'day' ? date === today : mondayOf(date) === mondayOf(today);
  const names = {
    prev: mode === 'day' ? 'Día anterior' : 'Semana anterior',
    next: mode === 'day' ? 'Día siguiente' : 'Semana siguiente',
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            iconOnly
            aria-label={names.prev}
            onClick={() => update({ date: addDays(date, -step) })}
          >
            <ChevronLeftIcon />
          </Button>
          <p className="m-0 min-w-44 text-center text-md text-fg" aria-live="polite">
            {mode === 'day' ? (
              date === today ? (
                'hoy'
              ) : (
                formatLongDate(date)
              )
            ) : (
              <>
                semana {isoWeek(date)}
                <span className="block text-xs font-normal text-fg-muted">
                  {formatRange(range, today)}
                </span>
              </>
            )}
          </p>
          <Button
            variant="secondary"
            iconOnly
            aria-label={names.next}
            onClick={() => update({ date: addDays(date, step) })}
          >
            <ChevronRightIcon />
          </Button>
          <Button variant="secondary" disabled={isCurrent} onClick={() => update({ date: null })}>
            Hoy
          </Button>
        </div>
        <label className="ml-auto flex items-center gap-2 text-base text-fg-muted">
          Proyecto
          <Select
            className="w-48"
            value={project ?? ''}
            onChange={(e) => update({ project: e.target.value || null })}
          >
            <option value="">Todos</option>
            {(projects.data ?? [])
              .filter((p) => !p.archivedAt || p.slug === project)
              .map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
          </Select>
        </label>
        {/* Con `key`, otra vista (fecha o proyecto distintos) descarta el respaldo del resumen anterior. */}
        <CopySummary
          key={`${filters.from}|${filters.to}|${filters.project ?? ''}`}
          filters={filters}
        />
      </div>
      <LogBody
        mode={mode}
        filters={filters}
        today={today}
        timeZone={settings.data.timezone}
        firstProjectSlug={project ?? projects.data?.find((p) => !p.archivedAt)?.slug ?? null}
      />
    </div>
  );
}

/** "Copiar resumen" (RF-43): pide el markdown con los mismos filtros; si el portapapeles falla, lo deja seleccionable. */
function CopySummary({ filters }: { filters: LogFilters }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fallback, setFallback] = useState<string | null>(null);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), FEEDBACK_MS);
    return () => clearTimeout(t);
  }, [copied]);

  useEffect(() => {
    if (fallback === null) return;
    fallbackRef.current?.focus();
    fallbackRef.current?.select();
  }, [fallback]);

  const { from, to, project } = filters;

  const copy = useCallback(async () => {
    setBusy(true);
    let markdown: string;
    try {
      markdown = await fetchSummary({ from, to, project });
    } catch (error) {
      setBusy(false);
      if (!isUnauthorized(error)) {
        toast.show({
          tone: 'danger',
          message: error instanceof ApiError ? error.message : 'No se pudo generar el resumen',
        });
      }
      return;
    }
    setBusy(false);
    try {
      await navigator.clipboard.writeText(markdown);
      setFallback(null);
      setCopied(true);
      toast.show({ tone: 'success', message: 'Copiado' });
    } catch {
      setFallback(markdown);
      toast.show({
        tone: 'danger',
        message:
          'No se pudo copiar al portapapeles. El resumen quedó seleccionado para copiarlo a mano.',
      });
    }
  }, [from, to, project, toast]);

  return (
    <>
      <Button variant="secondary" disabled={busy} onClick={() => void copy()}>
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? 'Copiado' : 'Copiar resumen'}
      </Button>
      {fallback !== null && (
        <Textarea
          ref={fallbackRef}
          readOnly
          aria-label="Resumen en markdown"
          value={fallback}
          rows={8}
          className="basis-full font-mono"
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
    </>
  );
}

function LogBody({
  mode,
  filters,
  today,
  timeZone,
  firstProjectSlug,
}: {
  mode: LogViewMode;
  filters: LogFilters;
  today: string;
  timeZone: string;
  firstProjectSlug: string | null;
}) {
  const log = useLogView(filters);

  if (log.isPending) return <LogSkeleton />;
  if (log.isError) {
    const notFound = log.error instanceof ApiError && log.error.status === 404;
    return (
      <LoadError
        message={notFound ? 'Este proyecto no existe.' : 'No se pudo cargar la bitácora.'}
        onRetry={notFound ? undefined : () => void log.refetch()}
      />
    );
  }

  const { days, moved } = log.data;
  if (days.length === 0 && moved.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 py-8">
        <p className="m-0 text-base text-fg-muted">
          {mode === 'day' ? 'Sin registros este día' : 'Sin registros esta semana'}
        </p>
        {firstProjectSlug && (
          <Link
            to={`/p/${firstProjectSlug}`}
            className="text-base text-primary underline focus-visible:outline-2 focus-visible:outline-focus"
          >
            Ir al tablero
          </Link>
        )}
      </div>
    );
  }

  const movedTitle =
    mode === 'day'
      ? filters.from === today
        ? 'Se movieron hoy'
        : 'Se movieron ese día'
      : filters.from === mondayOf(today)
        ? 'Se movieron esta semana'
        : 'Se movieron esa semana';

  const CardHeading = mode === 'week' ? 'h4' : 'h3';

  return (
    <div className="flex flex-col gap-8">
      {days.map((day) => (
        <section key={day.date} className="flex flex-col gap-4">
          {mode === 'week' && (
            <h2 className="m-0 border-b border-border pb-1 text-md text-fg">
              {formatDayHeading(day.date)}
            </h2>
          )}
          {day.projects.map(({ project, cards }) => (
            <div key={project.id} className="flex flex-col gap-2">
              {mode === 'week' ? (
                <h3 className="m-0 flex items-center gap-2 text-base font-semibold text-fg">
                  <ProjectName name={project.name} color={project.color} />
                </h3>
              ) : (
                <h2 className="m-0 flex items-center gap-2 text-md text-fg">
                  <ProjectName name={project.name} color={project.color} />
                </h2>
              )}
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {cards.map(({ card, entries }) => (
                  <li
                    key={card.ref}
                    className="rounded-md border border-border bg-surface p-3 shadow-card"
                  >
                    {/* §6.1: un encabezado por tarjeta (h3 en Mi día; en Mi semana el día es h2 y el proyecto h3). */}
                    <CardHeading className="m-0 text-sm font-normal">
                      <Link
                        to={`/p/${project.slug}/${card.ref}`}
                        className="flex items-center gap-2 text-sm text-fg no-underline hover:underline focus-visible:outline-2 focus-visible:outline-focus"
                      >
                        <span className="font-mono text-xs text-fg-muted">{card.ref}</span>{' '}
                        <span className="min-w-0 flex-1 truncate">{card.title}</span>{' '}
                        <Chip tone={STATUS_TONE[card.status]}>{STATUS_NAME[card.status]}</Chip>
                      </Link>
                    </CardHeading>
                    <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0 pl-4">
                      {entries.map((entry) => (
                        <EntryRow key={entry.id} entry={entry} timeZone={timeZone} />
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
      {moved.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="log-moved">
          <h2 id="log-moved" className="m-0 text-md text-fg">
            {movedTitle}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {moved.map((card) => (
              <li key={card.ref} className="text-sm text-fg">
                <Link
                  to={`/p/${card.project}/${card.ref}`}
                  className="text-fg no-underline hover:underline focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <span className="font-mono text-xs text-fg-muted">{card.ref}</span>
                  {' · '}
                  {movePath(card.ref, card.status, days)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ProjectName({ name, color }: { name: string; color: string }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn('size-2.5 shrink-0 rounded-full', projectDotClass(color))}
      />
      {name}
    </>
  );
}

function EntryRow({ entry, timeZone }: { entry: LogEntryDto; timeZone: string }) {
  const time = (
    <time dateTime={entry.occurredAt} className="w-11 shrink-0 text-xs text-fg-muted">
      {clock(new Date(entry.occurredAt), timeZone)}
    </time>
  );
  // Las notas y los bloqueos son markdown mío: se pintan con el componente sanitizado (RS-12).
  if (entry.kind === 'note' || entry.kind === 'blocked') {
    return (
      <li className="flex items-baseline gap-2">
        {time}
        <div className="min-w-0 flex-1">
          {entry.kind === 'blocked' && <Chip tone="danger">Bloqueado</Chip>}
          <Markdown source={entry.body} size="sm" />
        </div>
      </li>
    );
  }
  // moved / commit / pr: una línea atenuada, como texto.
  return (
    <li className="flex items-baseline gap-2 text-xs text-fg-muted">
      {time}
      <span className="min-w-0 flex-1 break-words">{entry.body}</span>
    </li>
  );
}

/** `Por hacer → En curso → Bloqueado` a partir de las entradas `moved` del período; sin ellas, el estado actual. */
function movePath(ref: string, current: CardStatus, days: LogView['days']): string {
  const moves: { from?: string; to?: string }[] = [];
  for (const day of days) {
    for (const { cards } of day.projects) {
      for (const c of cards) {
        if (c.card.ref !== ref) continue;
        for (const e of c.entries) if (e.kind === 'moved') moves.push(e.metadata);
      }
    }
  }
  const name = (s: string | undefined) => STATUS_NAME[s as CardStatus] ?? s;
  const first = moves[0]?.from;
  if (!first) return STATUS_NAME[current];
  return [name(first), ...moves.map((m) => name(m.to))].join(' → ');
}

function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3">
      <p className="m-0 text-fg">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

function LogSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Cargando bitácora">
      <Skeleton className="h-8 w-80" />
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}
