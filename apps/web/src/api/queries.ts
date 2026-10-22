import { useQuery } from '@tanstack/react-query';
import type { MeDto, ProjectWithCountsDto } from 'shared';
import { api } from './client';

export const queryKeys = {
  me: ['me'] as const,
  projects: ['projects'] as const,
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
