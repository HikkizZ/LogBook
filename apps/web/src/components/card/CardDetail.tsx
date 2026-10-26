import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CARD_PRIORITIES, type CardDetailDto, type CardPriority, type CardStatus } from 'shared';
import { useArchiveCard, useCardDetail, useUpdateCard } from '../../api/card-queries';
import { ApiError } from '../../api/client';
import { useProjects } from '../../api/queries';
import { cn } from '../../lib/cn';
import { PRIORITY_NAME, STATUS_NAME } from '../../lib/board';
import { projectDotClass } from '../../lib/colors';
import { Button } from '../ui/Button';
import { Chip, type ChipTone } from '../ui/Chip';
import { Dialog } from '../ui/Dialog';
import { CloseIcon } from '../ui/icons';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Skeleton } from '../ui/Skeleton';
import { useToast } from '../ui/Toast';
import { ActionsMenu } from './ActionsMenu';
import { ChecklistTab } from './ChecklistTab';
import { CopyButton } from './CopyButton';
import { DescriptionTab } from './DescriptionTab';
import { LabelPicker } from './LabelPicker';
import { LogTab } from './LogTab';
import { TitleEditor } from './TitleEditor';

/** Chip de estado (§2.2). */
const STATUS_TONE: Record<CardStatus, ChipTone> = {
  backlog: 'neutral',
  todo: 'neutral',
  in_progress: 'info',
  review: 'info',
  blocked: 'danger',
  done: 'success',
};

type TabId = 'log' | 'description' | 'checklist';
const MIN_DATE = '1970-01-01';
const MAX_DATE = '2100-12-31';

interface CardDetailProps {
  slug: string;
  cardRef: string;
  /** `id` del título: nombre accesible del panel. */
  titleId: string;
  onClose: () => void;
  /** La tarjeta cambió de proyecto (o se abrió bajo el slug equivocado): la URL debe seguirla. */
  onProjectChanged: (slug: string) => void;
}

/** Contenido del panel de una tarjeta existente (§4.2): cabecera fija y cuerpo con pestañas. */
export function CardDetail({ slug, cardRef, titleId, onClose, onProjectChanged }: CardDetailProps) {
  const detail = useCardDetail(cardRef);

  const project = detail.data?.project;
  useEffect(() => {
    if (project && project !== slug) onProjectChanged(project);
  }, [project, slug, onProjectChanged]);

  if (detail.isPending) {
    return (
      <>
        <h2 id={titleId} className="sr-only">
          Cargando {cardRef}
        </h2>
        <div role="status" aria-label="Cargando tarjeta" className="flex flex-col gap-3 p-4">
          <Skeleton className="h-8" />
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </div>
      </>
    );
  }

  if (detail.isError) {
    const notFound = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <>
        <h2 id={titleId} className="sr-only">
          Tarjeta {cardRef}
        </h2>
        <div role="alert" className="flex flex-col items-start gap-3 p-4">
          <p className="m-0 text-base text-fg">
            {notFound ? `La tarjeta ${cardRef} no existe.` : 'No se pudo cargar la tarjeta.'}
          </p>
          <div className="flex gap-2">
            {!notFound && (
              <Button variant="secondary" onClick={() => void detail.refetch()}>
                Reintentar
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <LoadedCard
      card={detail.data}
      titleId={titleId}
      onClose={onClose}
      onProjectChanged={onProjectChanged}
    />
  );
}

function LoadedCard({
  card,
  titleId,
  onClose,
  onProjectChanged,
}: {
  card: CardDetailDto;
  titleId: string;
  onClose: () => void;
  onProjectChanged: (slug: string) => void;
}) {
  const update = useUpdateCard(card.ref);
  const archive = useArchiveCard(card.ref);
  const projects = useProjects();
  const toast = useToast();
  const [tab, setTab] = useState<TabId>('log');
  const [moving, setMoving] = useState(false);
  const ids = useId();

  const project = projects.data?.find((p) => p.slug === card.project);
  const archived = card.archivedAt !== null;

  const toggleArchive = () =>
    archive.mutate(!archived, {
      onSuccess: () =>
        toast.show({
          tone: 'success',
          message: archived ? `${card.ref} desarchivada` : `${card.ref} archivada`,
        }),
    });

  const tabs: { id: TabId; label: ReactNode }[] = [
    { id: 'log', label: 'Bitácora' },
    { id: 'description', label: 'Descripción' },
    {
      id: 'checklist',
      label: (
        <>
          Checklist
          {card.checklistTotal > 0 && ' '}
          {card.checklistTotal > 0 && (
            <span className="ml-1 text-xs font-normal">
              {card.checklistDone}/{card.checklistTotal}
            </span>
          )}
        </>
      ),
    },
  ];

  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    const next =
      e.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : e.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    const target = next === null ? undefined : tabs[next];
    if (!target) return;
    e.preventDefault();
    setTab(target.id);
    document.getElementById(`${ids}-tab-${target.id}`)?.focus();
  };

  return (
    <>
      <header className="flex max-h-[55vh] shrink-0 flex-col gap-3 overflow-y-auto border-b border-border p-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-fg-muted">{card.ref}</span>
          <CopyButton text={card.ref} label={`Copiar ${card.ref}`} />
          <Chip tone={STATUS_TONE[card.status]}>{STATUS_NAME[card.status]}</Chip>
          {archived && <Chip>Archivada</Chip>}
          <div className="ml-auto flex items-center gap-2">
            <ActionsMenu
              archived={archived}
              onMove={() => setMoving(true)}
              onToggleArchive={toggleArchive}
            />
            <Button variant="secondary" iconOnly aria-label="Cerrar panel" onClick={onClose}>
              <CloseIcon />
            </Button>
          </div>
        </div>

        <TitleEditor
          title={card.title}
          titleId={titleId}
          onSave={(title) => update.mutate({ title })}
        />

        <div className="grid grid-cols-2 gap-3">
          {/* TODO(diseño): §4.2 pide un selector de proyecto aquí; se muestra de solo lectura y el cambio va en `⋯` (RF-28) para no mover por accidente. */}
          <div role="group" aria-label="Proyecto" className="flex flex-col gap-1">
            <span className="text-xs text-fg-muted">Proyecto</span>
            <span className="flex min-h-8 items-center gap-2 text-base text-fg">
              {project && (
                <span
                  aria-hidden="true"
                  className={cn('size-2.5 shrink-0 rounded-full', projectDotClass(project.color))}
                />
              )}
              {project?.name ?? card.project}
            </span>
          </div>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Prioridad
            <Select
              value={card.priority}
              onChange={(e) => update.mutate({ priority: e.target.value as CardPriority })}
            >
              {CARD_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_NAME[p]}
                </option>
              ))}
            </Select>
          </label>
          <DateField
            label="Fecha de inicio"
            value={card.startDate}
            onCommit={(startDate) => update.mutate({ startDate })}
          />
          <DateField
            label="Fecha límite"
            value={card.dueDate}
            onCommit={(dueDate) => update.mutate({ dueDate })}
          />
          <div role="group" aria-label="Etiquetas" className="col-span-2 flex flex-col gap-1">
            <span className="text-xs text-fg-muted">Etiquetas</span>
            <LabelPicker
              value={card.labels.map((l) => l.name)}
              current={card.labels}
              onChange={(labels) => update.mutate({ labels })}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs text-fg-muted">Rama sugerida</span>
          <code
            className="min-w-0 flex-1 truncate font-mono text-sm text-fg"
            title={card.branchName}
          >
            {card.branchName}
          </code>
          <CopyButton text={card.branchName} label="Copiar nombre de rama" />
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Secciones de la tarjeta"
        className="flex shrink-0 gap-4 border-b border-border px-4"
      >
        {tabs.map((t, index) => (
          <button
            key={t.id}
            id={`${ids}-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`${ids}-panel`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => onTabKeyDown(e, index)}
            className={cn(
              '-mb-px h-10 cursor-pointer border-b-2 px-1 text-base',
              tab === t.id
                ? 'border-primary font-semibold text-fg'
                : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${ids}-panel`}
        aria-labelledby={`${ids}-tab-${tab}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        {tab === 'log' && <LogTab cardRef={card.ref} />}
        {tab === 'description' && (
          <DescriptionTab
            description={card.description}
            saving={update.isPending}
            onSave={(description, onDone) => update.mutate({ description }, { onSuccess: onDone })}
          />
        )}
        {tab === 'checklist' && <ChecklistTab cardRef={card.ref} items={card.checklist} />}
      </div>

      <MoveProjectDialog
        open={moving}
        card={card}
        pending={update.isPending}
        onClose={() => setMoving(false)}
        onMove={(slug) =>
          update.mutate(
            { project: slug },
            {
              onSuccess: () => {
                setMoving(false);
                onProjectChanged(slug);
              },
            },
          )
        }
      />
    </>
  );
}

/** "Mover a otro proyecto" (RF-28): conserva ID, bitácora y checklist; va al final de la misma columna. */
function MoveProjectDialog({
  open,
  card,
  pending,
  onClose,
  onMove,
}: {
  open: boolean;
  card: CardDetailDto;
  pending: boolean;
  onClose: () => void;
  onMove: (slug: string) => void;
}) {
  const projects = useProjects();
  const options = (projects.data ?? []).filter((p) => p.slug !== card.project);
  const [target, setTarget] = useState('');
  const chosen = target || options[0]?.slug || '';

  return (
    <Dialog open={open} onClose={onClose} title={`Mover ${card.ref} a otro proyecto`}>
      {options.length === 0 ? (
        <p className="m-0 mb-4 text-base text-fg-muted">No hay otros proyectos activos.</p>
      ) : (
        <label className="mb-4 flex flex-col gap-1 text-sm text-fg-muted">
          Proyecto de destino
          <Select data-autofocus value={chosen} onChange={(e) => setTarget(e.target.value)}>
            {options.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </Select>
        </label>
      )}
      <p className="m-0 mb-4 text-xs text-fg-muted">
        Conserva su ID, bitácora y checklist, y va al final de la misma columna.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button disabled={!chosen || pending} onClick={() => onMove(chosen)}>
          Mover
        </Button>
      </div>
    </Dialog>
  );
}

/**
 * Campo de fecha (RF-21). Un `<input type="date">` entrega `''` mientras se está editando una parte de la fecha:
 * solo se guarda una fecha completa al instante; vaciarla (quitar la fecha) se guarda al salir del campo.
 */
function DateField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string | null;
  onCommit: (value: string | null) => void;
}) {
  const [cleared, setCleared] = useState(false);
  return (
    <label className="flex flex-col gap-1 text-xs text-fg-muted">
      {label}
      <Input
        type="date"
        min={MIN_DATE}
        max={MAX_DATE}
        value={cleared ? '' : (value ?? '')}
        onChange={(e) => {
          const next = e.target.value;
          setCleared(next === '');
          // Un año a medio teclear (0002-…) cae fuera de min/max: no se guarda hasta que sea válido.
          if (next && e.target.validity.valid) onCommit(next);
        }}
        onBlur={() => {
          if (cleared && value !== null) onCommit(null);
          setCleared(false);
        }}
      />
    </label>
  );
}
