import { useState, type ReactNode } from 'react';
import { LABEL_COLORS, type CardDto, type CardStatus } from 'shared';
import { CardTile } from '../components/board/CardTile';
import { BOARD_GRID_CLASS, COLUMNS } from '../lib/board';
import {
  Button,
  Checkbox,
  Chip,
  Dialog,
  Input,
  Select,
  Skeleton,
  Textarea,
  Tooltip,
  useToast,
} from '../components/ui';
import { ClockIcon } from '../components/ui/icons';

// Solo en desarrollo: App.tsx monta /_kit tras import.meta.env.DEV, así que no entra al bundle de producción.

const SWATCHES: { name: string; className: string }[] = [
  { name: 'sidebar', className: 'bg-sidebar' },
  { name: 'sidebar-hover', className: 'bg-sidebar-hover' },
  { name: 'bg', className: 'bg-bg' },
  { name: 'surface', className: 'bg-surface' },
  { name: 'surface-hover', className: 'bg-surface-hover' },
  { name: 'border', className: 'bg-border' },
  { name: 'border-strong', className: 'bg-border-strong' },
  { name: 'fg', className: 'bg-fg' },
  { name: 'fg-muted', className: 'bg-fg-muted' },
  { name: 'primary', className: 'bg-primary' },
  { name: 'primary-hover', className: 'bg-primary-hover' },
  { name: 'primary-soft', className: 'bg-primary-soft' },
  { name: 'neutral', className: 'bg-neutral' },
  { name: 'success', className: 'bg-success' },
  { name: 'success-soft', className: 'bg-success-soft' },
  { name: 'warning', className: 'bg-warning' },
  { name: 'warning-soft', className: 'bg-warning-soft' },
  { name: 'danger', className: 'bg-danger' },
  { name: 'danger-soft', className: 'bg-danger-soft' },
];

const TEXT_SIZES: { name: string; className: string }[] = [
  { name: 'text-xs · 12/16 · IDs, metadatos, chips', className: 'text-xs' },
  { name: 'text-sm · 13/18 · títulos de tarjeta', className: 'text-sm' },
  { name: 'text-base · 14/20 · cuerpo general', className: 'text-base' },
  { name: 'text-md · 16/24 · cabeceras', className: 'text-md' },
  { name: 'text-lg · 20/28 · título de vista', className: 'text-lg' },
];

const STATES: { label: string; tone: 'neutral' | 'info' | 'danger' | 'success' }[] = [
  { label: 'Backlog', tone: 'neutral' },
  { label: 'Por hacer', tone: 'neutral' },
  { label: 'En curso', tone: 'info' },
  { label: 'Revisión', tone: 'info' },
  { label: 'Bloqueado', tone: 'danger' },
  { label: 'Hecho', tone: 'success' },
];

const KIT_TODAY = '2026-10-22';

function kitCard(
  n: number,
  status: CardStatus,
  extra: Partial<CardDto> = {},
  title = 'Migrar las facturas del sistema antiguo al nuevo esquema de la base de datos',
): CardDto {
  return {
    id: `kit-${n}`,
    ref: `T-${n}`,
    number: n,
    project: 'kit',
    title,
    description: '',
    status,
    priority: 'medium',
    labels: [],
    position: 0,
    startDate: null,
    dueDate: null,
    completedAt: null,
    archivedAt: null,
    checklistDone: 0,
    checklistTotal: 0,
    createdAt: '2026-10-20T12:00:00.000Z',
    updatedAt: '2026-10-20T12:00:00.000Z',
    ...extra,
  };
}

/** Seis estados × urgencias de la fecha límite (hoy fijo: 22 oct). */
const KIT_DUE: { label: string; dueDate: string | null }[] = [
  { label: 'sin fecha', dueDate: null },
  { label: 'lejana', dueDate: '2026-11-15' },
  { label: 'en 2 días', dueDate: '2026-10-24' },
  { label: 'vencida', dueDate: '2026-10-19' },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-3 border-b border-border pb-2 text-md">{title}</h2>
      <div className="flex flex-wrap items-center gap-4">{children}</div>
    </section>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex w-56 flex-col gap-1">
      <span className="text-xs text-fg-muted">{label}</span>
      {children}
    </div>
  );
}

export function KitPage() {
  const toast = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="max-w-5xl">
      <Section title="Colores">
        {SWATCHES.map((s) => (
          <div key={s.name} className="flex w-32 flex-col gap-1">
            <div className={`h-8 rounded-sm border border-border ${s.className}`} />
            <span className="font-mono text-xs text-fg-muted">{s.name}</span>
          </div>
        ))}
      </Section>

      <Section title="Tipografía">
        <div className="flex flex-col gap-1">
          {TEXT_SIZES.map((t) => (
            <span key={t.name} className={t.className}>
              {t.name}
            </span>
          ))}
          <span className="font-mono text-xs">T-42 · feat/T-42-slug (mono)</span>
        </div>
      </Section>

      <Section title="Button">
        <Button>Primario</Button>
        <Button disabled>Primario deshabilitado</Button>
        <Button variant="secondary">Secundario</Button>
        <Button variant="secondary" disabled>
          Secundario deshabilitado
        </Button>
        <Button variant="destructive">Destructivo</Button>
        <Button variant="destructive" disabled>
          Destructivo deshabilitado
        </Button>
        <Button variant="secondary" iconOnly aria-label="Reloj">
          <ClockIcon />
        </Button>
      </Section>

      <Section title="Input, Textarea, Select">
        <Labeled label="Input">
          <Input aria-label="Input de ejemplo" placeholder="Escribe aquí…" />
        </Labeled>
        <Labeled label="Input con valor">
          <Input aria-label="Input con valor" defaultValue="Migración de la base" />
        </Labeled>
        <Labeled label="Input inválido">
          <Input aria-label="Input inválido" aria-invalid="true" defaultValue="xx" />
        </Labeled>
        <Labeled label="Input deshabilitado">
          <Input aria-label="Input deshabilitado" disabled defaultValue="No editable" />
        </Labeled>
        <Labeled label="Textarea">
          <Textarea aria-label="Textarea de ejemplo" placeholder="Avancé… / quedó…" />
        </Labeled>
        <Labeled label="Textarea deshabilitado">
          <Textarea aria-label="Textarea deshabilitado" disabled defaultValue="No editable" />
        </Labeled>
        <Labeled label="Select">
          <Select aria-label="Select de ejemplo" defaultValue="media">
            <option value="urgente">Urgente</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </Select>
        </Labeled>
        <Labeled label="Select deshabilitado">
          <Select aria-label="Select deshabilitado" disabled>
            <option>Media</option>
          </Select>
        </Labeled>
      </Section>

      <Section title="Checkbox">
        <Checkbox label="Sin marcar" />
        <Checkbox label="Marcada" defaultChecked />
        <Checkbox label="Deshabilitada" disabled />
        <Checkbox label="Deshabilitada y marcada" disabled defaultChecked />
      </Section>

      <Section title="Chip · estado">
        {STATES.map((s) => (
          <Chip key={s.label} tone={s.tone}>
            {s.label}
          </Chip>
        ))}
        <Chip tone="warning">
          <ClockIcon width={12} height={12} />
          vence en 2 días
        </Chip>
        <Chip tone="danger">vencida</Chip>
      </Section>

      <Section title="Chip · proyecto y etiqueta (7 claves)">
        {LABEL_COLORS.map((c) => (
          <Chip key={c} color={c}>
            {c}
          </Chip>
        ))}
      </Section>

      <Section title="CardTile · 6 estados × urgencias">
        <div className={`${BOARD_GRID_CLASS} w-full overflow-x-auto`}>
          {COLUMNS.map(({ status, name }) => (
            <div key={status} className="flex flex-col gap-2">
              <span className="text-xs text-fg-muted">{name}</span>
              {KIT_DUE.map((d, i) => (
                <CardTile
                  key={d.label}
                  today={KIT_TODAY}
                  card={kitCard(i + 1, status, {
                    dueDate: d.dueDate,
                    labels:
                      i === 1
                        ? [
                            { name: 'feature', color: 'violeta' },
                            { name: 'bug', color: 'magenta' },
                            { name: 'docs', color: 'gris' },
                          ]
                        : [],
                    checklistDone: i === 1 ? 2 : 0,
                    checklistTotal: i === 1 ? 5 : 0,
                    priority: (['medium', 'low', 'high', 'urgent'] as const)[i] ?? 'medium',
                  })}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="flex gap-4">
          <div className="w-44">
            <CardTile
              today={KIT_TODAY}
              card={kitCard(9, 'todo', {}, 'Arrastrando')}
              state="overlay"
            />
          </div>
          <div className="w-44">
            <CardTile
              today={KIT_TODAY}
              card={kitCard(10, 'todo', {}, 'Hueco')}
              state="placeholder"
            />
          </div>
          <div className="w-44">
            <CardTile
              today={KIT_TODAY}
              card={kitCard(11, 'todo', { archivedAt: '2026-10-21T12:00:00.000Z' }, 'Archivada')}
            />
          </div>
        </div>
      </Section>

      <Section title="Dialog">
        <Button variant="secondary" onClick={() => setDialogOpen(true)}>
          Abrir diálogo
        </Button>
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="¿Por qué queda bloqueada T-42?"
        >
          <Textarea aria-label="Motivo del bloqueo" data-autofocus />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => setDialogOpen(false)}>
              Bloquear
            </Button>
          </div>
        </Dialog>
      </Section>

      <Section title="Toast">
        <Button
          variant="secondary"
          onClick={() => toast.show({ tone: 'success', message: 'Copiado' })}
        >
          Toast de éxito
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toast.show({
              tone: 'danger',
              message: 'No se pudo conectar con el servidor',
              action: { label: 'Reintentar', onClick: () => undefined },
            })
          }
        >
          Toast de error
        </Button>
      </Section>

      <Section title="Tooltip">
        <Tooltip label="Copiar ID">
          {(props) => (
            <Button variant="secondary" iconOnly aria-label="Copiar ID" {...props}>
              <ClockIcon />
            </Button>
          )}
        </Tooltip>
        <Tooltip label="Aparece con el ratón (300 ms) y con el foco">
          {(props) => (
            <Button variant="secondary" {...props}>
              Pasa el ratón o enfoca
            </Button>
          )}
        </Tooltip>
      </Section>

      <Section title="Skeleton">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-16 w-64" />
      </Section>
    </div>
  );
}
