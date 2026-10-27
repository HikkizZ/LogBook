import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CardDto,
  CardListDto,
  CardStatus,
  CreateCardBody,
  LabelDto,
  MeDto,
  ProjectWithCountsDto,
  SettingsDto,
} from 'shared';
import { applyMove, appendCard } from '../lib/board';
import { useToast } from '../components/ui/Toast';
import { api, ApiError } from './client';
import { invalidateLog } from './log-queries';

export const queryKeys = {
  me: ['me'] as const,
  projects: ['projects'] as const,
  settings: ['settings'] as const,
  labels: ['labels'] as const,
  cards: (slug: string) => ['cards', slug] as const,
  /** `GET /cards/:ref` (detalle del panel). Invalidar este prefijo refresca también la bitácora. */
  card: (ref: string) => ['card', ref] as const,
  cardLog: (ref: string) => ['card', ref, 'log'] as const,
};

/** `GET /me`: la UI sabe si está autenticada preguntando, no leyendo nada del navegador. */
export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: () => api.get<MeDto>('/me') });
}

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => api.get<ProjectWithCountsDto[]>('/projects'),
  });
}

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => api.get<SettingsDto>('/settings'),
  });
}

export function useLabels() {
  return useQuery({
    queryKey: queryKeys.labels,
    queryFn: () => api.get<LabelDto[]>('/labels'),
  });
}

const PAGE_SIZE = 200;

/** Todas las tarjetas activas del proyecto: sigue el cursor hasta agotarlo (el kanban filtra en el cliente, RF-18). */
async function fetchProjectCards(slug: string): Promise<CardDto[]> {
  const items: CardDto[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ project: slug, limit: String(PAGE_SIZE) });
    if (cursor) params.set('cursor', cursor);
    const page: CardListDto = await api.get<CardListDto>(`/cards?${params.toString()}`);
    items.push(...page.items);
    // Un cursor repetido volvería a pedir la misma página para siempre.
    if (page.nextCursor !== null && page.nextCursor === cursor) {
      throw new Error('La API repitió el cursor de paginación');
    }
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

export function useProjectCards(slug: string) {
  return useQuery({
    queryKey: queryKeys.cards(slug),
    queryFn: () => fetchProjectCards(slug),
  });
}

export interface MoveVariables {
  ref: string;
  status: CardStatus;
  /** Índice en la columna destino; omitido = al final. */
  position?: number;
  /** Motivo del bloqueo (RF-14). */
  reason?: string;
}

/**
 * `POST /cards/:ref/move` con actualización optimista (RF-11): la tarjeta cambia de sitio en la caché
 * al instante; si la API falla se restaura la caché anterior y se avisa con un toast (RF-14 incluido).
 */
export function useMoveCard(slug: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const key = queryKeys.cards(slug);

  const mutation = useMutation({
    mutationFn: ({ ref, status, position, reason }: MoveVariables) =>
      api.post<CardDto>(`/cards/${ref}/move`, { status, position, reason }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CardDto[]>(key);
      queryClient.setQueryData<CardDto[]>(key, (old) => old && applyMove(old, vars));
      return { previous };
    },
    onError: (error, vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.show({
        tone: 'danger',
        message: `No se pudo mover ${vars.ref}: ${error.message}`,
        action:
          error instanceof ApiError && error.status === 0
            ? { label: 'Reintentar', onClick: () => mutation.mutate(vars) }
            : undefined,
      });
    },
    onSettled: (_data, _error, vars) => {
      // El detalle del panel (estado, fechas y entrada `moved`) ya no es el que hay en caché.
      void queryClient.invalidateQueries({ queryKey: queryKeys.card(vars.ref) });
      invalidateLog(queryClient);
      // Con otro movimiento en vuelo se espera al último: refrescar antes pisaría su cambio optimista.
      if (queryClient.isMutating({ mutationKey: ['move-card'] }) > 1) return;
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
    mutationKey: ['move-card'],
  });
  return mutation;
}

/** `POST /cards` (RF-26): crea la tarjeta al final de la columna y la añade a la caché. */
export function useCreateCard(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: Omit<CreateCardBody, 'project'>) =>
      api.post<CardDto>('/cards', { project: slug, ...vars }),
    onSuccess: async (card) => {
      // Un refetch en vuelo (p. ej. el de un `move`) traería una foto sin esta tarjeta y la pisaría.
      await queryClient.cancelQueries({ queryKey: queryKeys.cards(slug) });
      queryClient.setQueryData<CardDto[]>(queryKeys.cards(slug), (old) =>
        old ? appendCard(old, card) : old,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}
