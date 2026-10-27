import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { CardDto, LogEntryDto, ProjectDto } from 'shared';
import { api } from './client';

/** `GET /log` (docs/api.md): el `card` de `days[]` va sin `description`; el de `moved[]`, completo. */
export interface LogView {
  days: {
    date: string;
    projects: {
      project: ProjectDto;
      cards: { card: Omit<CardDto, 'description'>; entries: LogEntryDto[] }[];
    }[];
  }[];
  moved: CardDto[];
}

export interface LogFilters {
  from: string;
  to: string;
  /** Slug del proyecto; `null` = todos (RF-44). */
  project: string | null;
}

function queryString({ from, to, project }: LogFilters): string {
  const params = new URLSearchParams({ from, to });
  if (project) params.set('project', project);
  return params.toString();
}

export const logQueryKeys = {
  log: (f: LogFilters) => ['log', f.from, f.to, f.project] as const,
};

/** Toda vista de Mi día/semana en caché queda vieja: una nota o un movimiento cambia lo que muestra (RF-40..RF-42). */
export function invalidateLog(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ['log'] });
}

export function useLogView(filters: LogFilters) {
  return useQuery({
    queryKey: logQueryKeys.log(filters),
    queryFn: () => api.get<LogView>(`/log?${queryString(filters)}`),
  });
}

/** `GET /summary?format=md` con los mismos filtros que la vista (RF-43). */
export function fetchSummary(filters: LogFilters): Promise<string> {
  return api.getText(`/summary?${queryString(filters)}&format=md`);
}
