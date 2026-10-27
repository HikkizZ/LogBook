import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { SEARCH_MIN_LENGTH, type SearchResultDto } from 'shared';
import { api } from './client';

/** Resultados por consulta de la paleta (la API acepta hasta 100). */
const SEARCH_LIMIT = 20;

/**
 * `GET /search` (RF-50..RF-52). No consulta con menos de 3 caracteres (RF-52): la API respondería 400.
 * `q` ya viene recortado y con debounce; los resultados anteriores se conservan mientras llegan los nuevos.
 */
export function useSearch(q: string) {
  return useQuery({
    queryKey: ['search', q] as const,
    queryFn: () =>
      api.get<SearchResultDto>(`/search?q=${encodeURIComponent(q)}&limit=${SEARCH_LIMIT}`),
    enabled: q.length >= SEARCH_MIN_LENGTH,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}
