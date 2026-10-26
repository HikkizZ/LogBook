import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CardListDto, LabelColor, LabelDto, SettingsDto, UpdateSettingsBody } from 'shared';
import { useNavigate } from 'react-router';
import { api } from './client';
import { queryKeys } from './queries';

/** `GET /tokens` (docs/api.md §3): nunca trae el token ni su hash. */
export interface ApiTokenDto {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

/** Respuesta de `POST /tokens`: `token` viene solo aquí, una vez. */
export interface CreatedTokenDto {
  id: string;
  name: string;
  prefix: string;
  token: string;
  expiresAt: string;
}

export const tokensKey = ['tokens'] as const;

// ---------- Etiquetas (RF-23) ----------

/** Las tarjetas llevan el nombre y el color de sus etiquetas: al cambiarlas hay que refrescarlas. */
function useRefreshLabels() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.labels });
    void queryClient.invalidateQueries({ queryKey: ['cards'] });
  };
}

export function useCreateLabel() {
  const refresh = useRefreshLabels();
  return useMutation({
    mutationFn: (body: { name: string; color: LabelColor }) => api.post<LabelDto>('/labels', body),
    onSuccess: refresh,
  });
}

export function useUpdateLabel() {
  const refresh = useRefreshLabels();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; color?: LabelColor }) =>
      api.patch<LabelDto>(`/labels/${id}`, body),
    onSuccess: refresh,
  });
}

export function useDeleteLabel() {
  const refresh = useRefreshLabels();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/labels/${id}`),
    onSuccess: refresh,
  });
}

/** Cuántas tarjetas (archivadas incluidas) llevan la etiqueta, para "Se quita de N tarjetas". */
export function useLabelUsage(name: string) {
  return useQuery({
    queryKey: ['label-usage', name] as const,
    gcTime: 0,
    queryFn: async () => {
      const params = new URLSearchParams({ label: name, archived: 'true', limit: '200' });
      const page = await api.get<CardListDto>(`/cards?${params.toString()}`);
      return { count: page.items.length, more: page.nextCursor !== null };
    },
  });
}

// ---------- Tokens (RF-61) ----------

export function useTokens() {
  return useQuery({ queryKey: tokensKey, queryFn: () => api.get<ApiTokenDto[]>('/tokens') });
}

/**
 * `POST /tokens`. Deliberadamente NO es un `useMutation`: el caché de mutaciones guarda el resultado
 * y el token en claro no debe quedar en ninguna caché; solo lo recibe quien llama.
 */
export function createToken(name: string): Promise<CreatedTokenDto> {
  return api.post<CreatedTokenDto>('/tokens', { name });
}

export function useRevokeToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/tokens/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tokensKey }),
  });
}

// ---------- Ajustes (§4.8, RF-64) ----------

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateSettingsBody) => api.patch<SettingsDto>('/settings', body),
    onSuccess: (settings) => queryClient.setQueryData(queryKeys.settings, settings),
  });
}

/**
 * "Salir" / "Cerrar todas las sesiones": igual que el flujo de 401 (ApiBridge), caché fuera y a `/login`.
 */
export function useEndSession(all: boolean) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => api.post<undefined>(all ? '/auth/logout-all' : '/auth/logout'),
    onSuccess: () => {
      queryClient.clear();
      void navigate('/login', { replace: true, state: { expired: false } });
    },
  });
}
