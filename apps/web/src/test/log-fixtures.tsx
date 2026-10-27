import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import type { CardDto, LogEntryDto, ProjectDto } from 'shared';
import { createQueryClient } from '../api/query-client';
import type { LogView } from '../api/log-queries';
import { ToastProvider } from '../components/ui/Toast';
import { TodayPage } from '../pages/TodayPage';
import { WeekPage } from '../pages/WeekPage';
import { ME, SETTINGS, makeCard, makeProject, url } from './board-fixtures';
import { makeEntry } from './card-fixtures';
import { server } from './server';

export function logProject(slug: string, name: string, color = 'violeta'): ProjectDto {
  const project: ProjectDto & { cardCounts?: unknown } = { ...makeProject(slug), name, color };
  delete project.cardCounts;
  return project;
}

export function logCard(
  number: number,
  project: string,
  title: string,
  extra: Partial<CardDto> = {},
): Omit<CardDto, 'description'> {
  const card: Partial<CardDto> = makeCard('in_progress', { number, project, title, ...extra });
  delete card.description;
  return card as Omit<CardDto, 'description'>;
}

export function logEntry(
  cardRef: string,
  body: string,
  occurredAt: string,
  extra: Partial<LogEntryDto> = {},
): LogEntryDto {
  return makeEntry('note', { cardRef, body, occurredAt, ...extra });
}

export interface LogRequest {
  path: string;
  params: Record<string, string>;
}

export interface LogApi {
  logRequests: LogRequest[];
  summaryRequests: LogRequest[];
}

function LocationProbe() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="location">{pathname + search}</output>
      <button type="button" onClick={() => void navigate(-1)}>
        Atrás (prueba)
      </button>
    </>
  );
}

/** Renderiza `/today` o `/week` con una API falsa: `GET /log` responde `view`, `GET /summary` responde `summary`. */
export function renderLog(
  path: string,
  view: LogView,
  summary = '## Día 2026-10-21\n',
  projects: ProjectDto[] = [logProject('siga', 'SIGA')],
): LogApi {
  const api: LogApi = { logRequests: [], summaryRequests: [] };
  const record = (list: LogRequest[], request: Request) => {
    const u = new URL(request.url);
    list.push({ path: u.pathname, params: Object.fromEntries(u.searchParams) });
  };
  server.use(
    http.get(url('/me'), () => HttpResponse.json(ME)),
    http.get(url('/settings'), () => HttpResponse.json(SETTINGS)),
    http.get(url('/projects'), () =>
      HttpResponse.json(
        projects.map((p) => ({ ...p, cardCounts: makeProject(p.slug).cardCounts })),
      ),
    ),
    http.get(url('/log'), ({ request }) => {
      record(api.logRequests, request);
      return HttpResponse.json(view);
    }),
    http.get(url('/summary'), ({ request }) => {
      record(api.summaryRequests, request);
      return new HttpResponse(summary, { headers: { 'Content-Type': 'text/markdown' } });
    }),
  );
  render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/today" element={<TodayPage />} />
            <Route path="/week" element={<WeekPage />} />
            <Route path="/p/:slug/:ref" element={<p>Panel de tarjeta</p>} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return api;
}
