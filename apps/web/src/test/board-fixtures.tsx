import { render } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, useLocation } from 'react-router';
import type {
  CardDto,
  CardStatus,
  LabelDto,
  MeDto,
  ProjectWithCountsDto,
  SettingsDto,
} from 'shared';
import { App } from '../App';
import { createQueryClient } from '../api/query-client';
import { server } from './server';

export const url = (path: string) => `${window.location.origin}/api/v1${path}`;

export const ME: MeDto = {
  auth: 'session',
  expiresAt: '2026-10-29T12:00:00.000Z',
  idleExpiresAt: '2026-10-22T12:00:00.000Z',
};

export const SETTINGS: SettingsDto = {
  timezone: 'America/Santiago',
  doneDaysVisible: 14,
  wipDefault: 3,
};

export const LABELS: LabelDto[] = [
  { id: 'l1', name: 'bug', color: 'magenta', createdAt: '2026-10-01T12:00:00.000Z' },
  { id: 'l2', name: 'feature', color: 'violeta', createdAt: '2026-10-01T12:00:00.000Z' },
];

export function makeProject(slug: string, wipLimit = 3): ProjectWithCountsDto {
  return {
    id: slug,
    name: slug === 'siga' ? 'SIGA' : slug,
    slug,
    color: 'violeta',
    githubRepo: null,
    wipLimit,
    archivedAt: null,
    createdAt: '2026-10-20T12:00:00.000Z',
    updatedAt: '2026-10-20T12:00:00.000Z',
    cardCounts: { backlog: 0, todo: 0, in_progress: 0, review: 0, blocked: 0, done: 0 },
  };
}

let counter = 0;

export function makeCard(status: CardStatus, extra: Partial<CardDto> = {}): CardDto {
  counter += 1;
  const number = extra.number ?? counter;
  return {
    id: `id-${number}`,
    ref: `T-${number}`,
    number,
    project: 'siga',
    title: `Tarjeta ${number}`,
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

/** Numera `position` por columna en el orden en que vienen. */
export function withPositions(cards: CardDto[]): CardDto[] {
  const seen: Record<string, number> = {};
  return cards.map((c) => {
    const position = seen[c.status] ?? 0;
    seen[c.status] = position + 1;
    return { ...c, position };
  });
}

export function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{pathname + search}</output>;
}

export interface MoveRequest {
  ref: string;
  body: { status: CardStatus; position?: number; reason?: string };
}

export interface BoardApi {
  cards: CardDto[];
  moves: MoveRequest[];
  created: { title: string; status: CardStatus }[];
  /** Si se define, el `move` espera a esta promesa y responde con el estado que devuelva. */
  moveGate?: () => Promise<number>;
}

/**
 * Levanta la API falsa del kanban (msw) con las tarjetas dadas y renderiza la app en `path`.
 * El `move` sin `moveGate` aplica el cambio al arreglo (como la API real) y responde 200.
 */
export function renderBoard(
  initial: CardDto[],
  path = '/p/siga',
  wipLimit = 3,
  cardsStatus = 200,
): BoardApi {
  const api: BoardApi = { cards: withPositions(initial), moves: [], created: [] };
  server.use(
    http.get(url('/me'), () => HttpResponse.json(ME)),
    http.get(url('/projects'), () => HttpResponse.json([makeProject('siga', wipLimit)])),
    http.get(url('/settings'), () => HttpResponse.json(SETTINGS)),
    http.get(url('/labels'), () => HttpResponse.json(LABELS)),
    http.get(url('/cards'), ({ request }) => {
      if (cardsStatus !== 200) {
        return HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'No existe' } },
          { status: cardsStatus },
        );
      }
      const params = new URL(request.url).searchParams;
      const limit = Number(params.get('limit') ?? 100);
      const offset = Number(params.get('cursor') ?? 0);
      const page = api.cards.slice(offset, offset + limit);
      const next = offset + limit < api.cards.length ? String(offset + limit) : null;
      return HttpResponse.json({ items: page, nextCursor: next });
    }),
    http.post(url('/cards/:ref/move'), async ({ request, params }) => {
      const body = (await request.json()) as MoveRequest['body'];
      const ref = String(params.ref);
      api.moves.push({ ref, body });
      const status = api.moveGate ? await api.moveGate() : 200;
      if (status !== 200) {
        return HttpResponse.json(
          { error: { code: 'INTERNAL', message: 'Falló el servidor' } },
          { status },
        );
      }
      const card = api.cards.find((c) => c.ref === ref);
      if (card) {
        card.status = body.status;
        card.position = body.position ?? 999;
      }
      return HttpResponse.json(card);
    }),
    http.post(url('/cards'), async ({ request }) => {
      const body = (await request.json()) as { title: string; status: CardStatus };
      api.created.push({ title: body.title, status: body.status });
      const card = makeCard(body.status, {
        title: body.title,
        position: api.cards.filter((c) => c.status === body.status).length,
      });
      api.cards.push(card);
      return HttpResponse.json(card, { status: 201 });
    }),
  );
  render(
    <MemoryRouter initialEntries={[path]}>
      <App queryClient={createQueryClient()} />
      <LocationProbe />
    </MemoryRouter>,
  );
  return api;
}
