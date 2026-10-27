import { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import type { CardStatus } from 'shared';
import { useProjectCards, useProjects, useSettings } from '../api/queries';
import { useRegisterNewCard } from '../app/NewCardContext';
import { Board } from '../components/board/Board';
import { CardPanel } from '../components/card/CardPanel';
import { Button, Skeleton } from '../components/ui';
import { ApiError } from '../api/client';
import { BOARD_GRID_CLASS, parseFilters } from '../lib/board';
import { todayIn } from '../lib/dates';

const DEFAULT_DONE_DAYS = 14;

/**
 * Kanban de un proyecto (`/p/:slug`, §4.1) y, encima, el panel de detalle (`/p/:slug/:ref`, §4.2).
 * Con `key` el estado local no pasa de un proyecto a otro.
 */
export function BoardPage() {
  const { slug = '' } = useParams();
  return <ProjectBoard key={slug} slug={slug} />;
}

/** `value` si es una ruta interna (`/…`, no `//host` ni `/\host`); si no, `null`. */
function internalPath(value: unknown): string | null {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : null;
}

/** Carga las tarjetas y deja el resto al `Board`. */
function ProjectBoard({ slug }: { slug: string }) {
  const [params] = useSearchParams();
  const { ref = null } = useParams();
  const navigate = useNavigate();
  const { search, state } = useLocation();
  // D-1: Mi día, Mi semana y la paleta pasan su ruta en `state.from`; solo se acepta una ruta interna.
  const from = internalPath((state as { from?: unknown } | null)?.from);
  const cards = useProjectCards(slug);
  const projects = useProjects();
  const settings = useSettings();
  const [quickAddStatus, setQuickAddStatus] = useState<CardStatus | null>(null);
  // Un proyecto sin tarjetas muestra "Crea tu primera tarjeta" hasta que se pide la primera.
  const [startedEmpty, setStartedEmpty] = useState(false);
  // Panel en modo creación (`n`, "Nueva tarjeta"). Con una tarjeta en la URL manda el detalle.
  const [creating, setCreating] = useState(false);
  // Se fija al cargar la página: la ventana de Hecho no necesita reloj en vivo.
  const [nowMs] = useState(() => Date.now());

  const filters = useMemo(() => parseFilters(params), [params]);
  const project = projects.data?.find((p) => p.slug === slug);

  // `n` y el botón "Nueva tarjeta" de la barra superior abren el panel en modo creación (Plan 4.4).
  const openNewCard = useCallback(() => setCreating(true), []);
  useRegisterNewCard(openNewCard);
  // El estado vacío del proyecto (§4.1) sí ofrece la tarjeta rápida de "Por hacer".
  const openQuickAdd = useCallback(() => {
    setStartedEmpty(true);
    setQuickAddStatus('todo');
  }, []);

  // Cerrar el panel vuelve a la vista de origen (D-1) o, sin ella, al tablero conservando los filtros de la URL.
  const closePanel = useCallback(() => {
    setCreating(false);
    if (!ref) return;
    if (from) void navigate(from);
    else void navigate({ pathname: `/p/${slug}`, search });
  }, [from, navigate, ref, search, slug]);
  const showCard = useCallback(
    (cardRef: string, projectSlug = slug) => {
      setCreating(false);
      void navigate({ pathname: `/p/${projectSlug}/${cardRef}`, search }, { replace: true, state });
    },
    [navigate, search, slug, state],
  );
  const panel = (ref !== null || creating) && (
    <CardPanel
      slug={slug}
      cardRef={ref}
      fromOrigin={from !== null}
      onClose={closePanel}
      onCreated={showCard}
      onProjectChanged={(projectSlug) => ref && showCard(ref, projectSlug)}
    />
  );

  if (cards.isPending || settings.isPending || projects.isPending) return <BoardSkeleton />;
  if (cards.isError) {
    const notFound = cards.error instanceof ApiError && cards.error.status === 404;
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p className="m-0 text-fg">
          {notFound ? 'Este proyecto no existe.' : 'No se pudieron cargar las tarjetas.'}
        </p>
        {!notFound && (
          <Button variant="secondary" onClick={() => void cards.refetch()}>
            Reintentar
          </Button>
        )}
      </div>
    );
  }

  const timezone = settings.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (cards.data.length === 0 && !startedEmpty) {
    return (
      <div className="flex flex-col items-center gap-4 p-8 text-center">
        <p className="m-0 text-md text-fg">Crea tu primera tarjeta</p>
        <Button onClick={openQuickAdd}>Nueva tarjeta</Button>
        {panel}
      </div>
    );
  }

  return (
    <>
      <Board
        slug={slug}
        cards={cards.data}
        filters={filters}
        wipLimit={project?.wipLimit ?? 0}
        doneDaysVisible={settings.data?.doneDaysVisible ?? DEFAULT_DONE_DAYS}
        today={todayIn(timezone)}
        nowMs={nowMs}
        quickAddStatus={quickAddStatus}
        onQuickAddStatusChange={setQuickAddStatus}
      />
      {panel}
    </>
  );
}

function BoardSkeleton() {
  return (
    <div role="status" aria-label="Cargando tarjetas" className={BOARD_GRID_CLASS}>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-8" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ))}
    </div>
  );
}
