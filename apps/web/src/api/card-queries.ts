import { arrayMove } from '@dnd-kit/sortable';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  CardDetailDto,
  CardDto,
  ChecklistItemDto,
  LabelDto,
  LogEntryDto,
  UpdateCardBody,
  UpdateChecklistItemBody,
} from 'shared';
import { useToast } from '../components/ui/Toast';
import { api, isUnauthorized } from './client';
import { invalidateLog } from './log-queries';
import { queryKeys } from './queries';

// ---------------------------------------------------------------------------------------------
// Sincronía con el kanban: el panel y el tablero comparten tarjetas en dos cachés distintas
// (`['cards', slug]` y `['card', ref]`). Todo cambio hecho desde el panel pasa por aquí para que el
// tablero muestre el `2/5`, la fecha o la prioridad nuevos sin recargar.

const CARD_FIELDS = [
  'title',
  'description',
  'status',
  'priority',
  'labels',
  'position',
  'startDate',
  'dueDate',
  'completedAt',
  'archivedAt',
  'checklistDone',
  'checklistTotal',
  'updatedAt',
] as const satisfies readonly (keyof CardDto)[];

/** Copia a `target` los campos de `Card` que trae `source` (el detalle añade checklist, bitácora y rama). */
function mergeCard<T extends CardDto>(target: T, source: Partial<CardDto>): T {
  const next = { ...target };
  for (const field of CARD_FIELDS) {
    if (field in source) Object.assign(next, { [field]: source[field] });
  }
  return next;
}

function patchBoardCard(
  qc: QueryClient,
  slug: string,
  ref: string,
  change: (card: CardDto) => CardDto | null,
): void {
  qc.setQueryData<CardDto[]>(queryKeys.cards(slug), (old) =>
    old?.flatMap((c) => (c.ref === ref ? (change(c) ?? []) : [c])),
  );
}

/** Aplica una tarjeta devuelta por la API al detalle y al tablero. Una archivada sale del tablero (RF-27). */
function syncCard(qc: QueryClient, card: CardDto): void {
  qc.setQueryData<CardDetailDto>(queryKeys.card(card.ref), (old) => old && mergeCard(old, card));
  patchBoardCard(qc, card.project, card.ref, (c) => (card.archivedAt ? null : mergeCard(c, card)));
}

interface Snapshot {
  detail: CardDetailDto | undefined;
  board: CardDto[] | undefined;
  slug: string | undefined;
}

function snapshot(qc: QueryClient, ref: string): Snapshot {
  const detail = qc.getQueryData<CardDetailDto>(queryKeys.card(ref));
  const slug = detail?.project;
  return {
    detail,
    slug,
    board: slug ? qc.getQueryData<CardDto[]>(queryKeys.cards(slug)) : undefined,
  };
}

function restore(qc: QueryClient, ref: string, snap: Snapshot): void {
  qc.setQueryData(queryKeys.card(ref), snap.detail);
  if (snap.slug) qc.setQueryData(queryKeys.cards(snap.slug), snap.board);
}

/** Cambia el checklist del detalle y deja `checklistDone/Total` (en el detalle y en el tablero) al día. */
function editChecklist(
  qc: QueryClient,
  ref: string,
  change: (items: ChecklistItemDto[]) => ChecklistItemDto[],
): void {
  const detail = qc.getQueryData<CardDetailDto>(queryKeys.card(ref));
  if (!detail) return;
  const checklist = change(detail.checklist).map((item, position) => ({ ...item, position }));
  const counts = {
    checklistDone: checklist.filter((i) => i.done).length,
    checklistTotal: checklist.length,
  };
  qc.setQueryData<CardDetailDto>(queryKeys.card(ref), { ...detail, checklist, ...counts });
  patchBoardCard(qc, detail.project, ref, (c) => ({ ...c, ...counts }));
}

function useErrorToast() {
  const toast = useToast();
  return (what: string) => (error: Error) => {
    if (isUnauthorized(error)) return;
    toast.show({ tone: 'danger', message: `${what}: ${error.message}` });
  };
}

// ---------------------------------------------------------------------------------------------
// Detalle y bitácora

export function useCardDetail(ref: string | null) {
  return useQuery({
    queryKey: queryKeys.card(ref ?? ''),
    queryFn: () => api.get<CardDetailDto>(`/cards/${ref}`),
    enabled: ref !== null,
  });
}

/** Las últimas 500 entradas (el máximo de la API), cronológicas; `GET /cards/:ref` solo trae 50. */
export function useCardLog(ref: string) {
  return useQuery({
    queryKey: queryKeys.cardLog(ref),
    queryFn: () => api.get<LogEntryDto[]>(`/cards/${ref}/log?limit=500`),
  });
}

const byTime = (a: LogEntryDto, b: LogEntryDto) =>
  Date.parse(a.occurredAt) - Date.parse(b.occurredAt);

export interface AddLogVariables {
  ref: string;
  body: string;
  /** Instante ISO con zona (RF-30); omitido = ahora. */
  occurredAt?: string;
}

/** `POST /cards/:ref/log` (RF-31): la entrada aparece abajo al instante, sin recargar. */
export function useAddLogEntry() {
  const qc = useQueryClient();
  const fail = useErrorToast();
  return useMutation({
    mutationFn: ({ ref, ...body }: AddLogVariables) =>
      api.post<LogEntryDto>(`/cards/${ref}/log`, body),
    onSuccess: (entry) => {
      qc.setQueryData<LogEntryDto[]>(queryKeys.cardLog(entry.cardRef), (old) =>
        old ? [...old, entry].sort(byTime) : old,
      );
      invalidateLog(qc);
    },
    onError: fail('No se pudo guardar la entrada'),
  });
}

/** `PATCH /log/:id` (RF-32): solo `note` y `blocked`. */
export function useEditLogEntry() {
  const qc = useQueryClient();
  const fail = useErrorToast();
  return useMutation({
    mutationFn: ({ entry, body }: { entry: LogEntryDto; body: string }) =>
      api.patch<LogEntryDto>(`/log/${entry.id}`, { body }),
    onSuccess: (entry) => {
      qc.setQueryData<LogEntryDto[]>(queryKeys.cardLog(entry.cardRef), (old) =>
        old?.map((e) => (e.id === entry.id ? entry : e)),
      );
      invalidateLog(qc);
    },
    onError: fail('No se pudo editar la entrada'),
  });
}

/** `DELETE /log/:id`. */
export function useDeleteLogEntry() {
  const qc = useQueryClient();
  const fail = useErrorToast();
  return useMutation({
    mutationFn: (entry: LogEntryDto) => api.delete(`/log/${entry.id}`),
    onSuccess: (_data, entry) => {
      qc.setQueryData<LogEntryDto[]>(queryKeys.cardLog(entry.cardRef), (old) =>
        old?.filter((e) => e.id !== entry.id),
      );
      invalidateLog(qc);
    },
    onError: fail('No se pudo borrar la entrada'),
  });
}

// ---------------------------------------------------------------------------------------------
// Edición de la tarjeta

/** Campos que se pintan al instante; `project` espera a la respuesta (necesita el destino). */
const OPTIMISTIC_FIELDS = ['title', 'description', 'priority', 'startDate', 'dueDate'] as const;

const updateCardKey = (ref: string) => ['updateCard', ref] as const;

/**
 * `PATCH /cards/:ref` (RF-21, RF-28): los campos simples se ven al instante en el panel y en el kanban y se
 * revierten si la API los rechaza (p. ej. `dueDate < startDate`, o el `409` de un proyecto archivado).
 */
export function useUpdateCard(ref: string) {
  const qc = useQueryClient();
  const fail = useErrorToast();
  return useMutation({
    mutationKey: updateCardKey(ref),
    mutationFn: (patch: UpdateCardBody) => api.patch<CardDto>(`/cards/${ref}`, patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: queryKeys.card(ref), exact: true });
      const snap = snapshot(qc, ref);
      const simple: Partial<CardDto> = {};
      for (const field of OPTIMISTIC_FIELDS) {
        if (patch[field] !== undefined) Object.assign(simple, { [field]: patch[field] });
      }
      if (patch.labels !== undefined) {
        // Los colores salen de la caché de `labels`; la etiqueta que ya no figura conserva el suyo, o gris.
        const known = new Map<string, string>(
          snap.detail?.labels.map((l) => [l.name, l.color]) ?? [],
        );
        for (const l of qc.getQueryData<LabelDto[]>(queryKeys.labels) ?? [])
          known.set(l.name, l.color);
        simple.labels = patch.labels.map((name) => ({ name, color: known.get(name) ?? 'gris' }));
      }
      if (snap.slug && Object.keys(simple).length > 0) {
        qc.setQueryData<CardDetailDto>(queryKeys.card(ref), (old) => old && mergeCard(old, simple));
        patchBoardCard(qc, snap.slug, ref, (c) => mergeCard(c, simple));
      }
      return snap;
    },
    onError: (error, _patch, snap) => {
      if (snap) restore(qc, ref, snap);
      fail('No se pudo guardar el cambio')(error);
    },
    onSuccess: (response, patch, snap) => {
      invalidateLog(qc);
      // Con otro cambio en vuelo (dos clics rápidos en las etiquetas) esta respuesta ya está vieja: se
      // conserva lo que se ve y manda la del último.
      const othersInFlight = qc.isMutating({ mutationKey: updateCardKey(ref) }) > 1;
      const inFlightLabels = qc.getQueryData<CardDetailDto>(queryKeys.card(ref))?.labels;
      const card =
        othersInFlight && inFlightLabels ? { ...response, labels: inFlightLabels } : response;
      if (patch.project && snap.slug && card.project !== snap.slug) {
        // Cambió de proyecto: sale del tablero de origen y entra (al final) en el de destino.
        patchBoardCard(qc, snap.slug, ref, () => null);
        void qc.invalidateQueries({ queryKey: queryKeys.cards(card.project) });
        void qc.invalidateQueries({ queryKey: queryKeys.projects });
        qc.setQueryData<CardDetailDto>(
          queryKeys.card(ref),
          (old) => old && { ...mergeCard(old, card), project: card.project },
        );
      } else {
        syncCard(qc, card);
      }
      // La rama sugerida (RF-29) depende del título y de la etiqueta `bug`: no viene en `Card`.
      if (!othersInFlight && (patch.title !== undefined || patch.labels !== undefined)) {
        void qc.invalidateQueries({ queryKey: queryKeys.card(ref), exact: true });
      }
    },
  });
}

/** `POST /cards/:ref/archive|unarchive` (RF-27). */
export function useArchiveCard(ref: string) {
  const qc = useQueryClient();
  const fail = useErrorToast();
  return useMutation({
    mutationFn: (archive: boolean) =>
      api.post<CardDto>(`/cards/${ref}/${archive ? 'archive' : 'unarchive'}`),
    onSuccess: (card) => {
      syncCard(qc, card);
      invalidateLog(qc);
      // Desarchivar la devuelve al final de su columna: el tablero la pide de nuevo.
      void qc.invalidateQueries({ queryKey: queryKeys.cards(card.project) });
      void qc.invalidateQueries({ queryKey: queryKeys.projects });
    },
    onError: fail('No se pudo archivar la tarjeta'),
  });
}

// ---------------------------------------------------------------------------------------------
// Checklist (RF-24)

/** `POST /cards/:ref/checklist`. */
export function useAddChecklistItem(ref: string) {
  const qc = useQueryClient();
  const fail = useErrorToast();
  return useMutation({
    mutationFn: (text: string) => api.post<ChecklistItemDto>(`/cards/${ref}/checklist`, { text }),
    onSuccess: (item) => editChecklist(qc, ref, (items) => [...items, item]),
    onError: fail('No se pudo agregar el ítem'),
  });
}

/**
 * `PATCH /checklist/:id`: marcar, editar el texto o reordenar (`position`). El cambio se ve al instante,
 * incluido el `2/5` del kanban, y se revierte si falla.
 */
export function useUpdateChecklistItem(ref: string) {
  const qc = useQueryClient();
  const fail = useErrorToast();
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateChecklistItemBody & { id: string }) =>
      api.patch<ChecklistItemDto>(`/checklist/${id}`, patch),
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: queryKeys.card(ref), exact: true });
      const snap = snapshot(qc, ref);
      editChecklist(qc, ref, (items) => {
        const from = items.findIndex((i) => i.id === id);
        if (from < 0) return items;
        const changed = items.map((i) =>
          i.id === id ? { ...i, text: patch.text ?? i.text, done: patch.done ?? i.done } : i,
        );
        return patch.position === undefined
          ? changed
          : arrayMove(changed, from, Math.min(patch.position, changed.length - 1));
      });
      return snap;
    },
    onError: (error, _vars, snap) => {
      if (snap) restore(qc, ref, snap);
      fail('No se pudo actualizar el ítem')(error);
    },
  });
}

/** `DELETE /checklist/:id`. */
export function useDeleteChecklistItem(ref: string) {
  const qc = useQueryClient();
  const fail = useErrorToast();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/checklist/${id}`),
    onSuccess: (_data, id) => editChecklist(qc, ref, (items) => items.filter((i) => i.id !== id)),
    onError: fail('No se pudo quitar el ítem'),
  });
}
