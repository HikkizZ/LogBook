import { delay, http, HttpResponse } from 'msw';
import type { CardDto, ChecklistItemDto, LogEntryDto, LogKind, UpdateCardBody } from 'shared';
import { LABELS, renderBoard, url, type BoardApi } from './board-fixtures';
import { server } from './server';

let counter = 0;

export function makeEntry(kind: LogKind, extra: Partial<LogEntryDto> = {}): LogEntryDto {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    cardRef: 'T-1',
    kind,
    source: kind === 'note' || kind === 'blocked' ? 'ui' : 'api',
    body: `Entrada ${counter}`,
    occurredAt: new Date(Date.now() - (100 - counter) * 60_000).toISOString(),
    metadata: {},
    createdAt: '2026-10-20T12:00:00.000Z',
    ...extra,
  };
}

export function makeItem(id: string, text: string, done = false, position = 0): ChecklistItemDto {
  return { id, text, done, position };
}

export interface CardFakeApi extends BoardApi {
  patches: { ref: string; body: UpdateCardBody }[];
  logPosts: { ref: string; body: { body: string; occurredAt?: string } }[];
  logPatches: { id: string; body: { body?: string } }[];
  logDeletes: string[];
  checklistPosts: { ref: string; text: string }[];
  checklistPatches: { id: string; body: { text?: string; done?: boolean; position?: number } }[];
  checklistDeletes: string[];
  archives: { ref: string; archive: boolean }[];
  /** Estado del servidor falso, editable desde el test. */
  log: LogEntryDto[];
  checklist: ChecklistItemDto[];
  /** Si se define, el `PATCH /cards/:ref` responde este error. */
  patchError?: { status: number; message: string };
  /** Si se define, el `PATCH /cards/:ref` responde tras estos milisegundos (la API real tarda 200-300 ms). */
  patchDelay?: number;
}

interface Options {
  path?: string;
  log?: LogEntryDto[];
  checklist?: ChecklistItemDto[];
  otherProjects?: string[];
}

function syncCounts(api: CardFakeApi, ref: string): void {
  const card = api.cards.find((c) => c.ref === ref);
  if (!card) return;
  card.checklistTotal = api.checklist.length;
  card.checklistDone = api.checklist.filter((i) => i.done).length;
}

/**
 * Tablero con la API del panel de detalle (msw): `GET /cards/:ref`, edición, bitácora y checklist de la
 * tarjeta `T-1` (las demás tarjetas no tienen bitácora ni checklist). Comparte las tarjetas con el kanban
 * falso de `renderBoard`, así que un cambio hecho desde el panel se ve en el tablero como en la app real.
 */
export function renderPanel(initial: CardDto[], options: Options = {}): CardFakeApi {
  const state = {
    patches: [],
    logPosts: [],
    logPatches: [],
    logDeletes: [],
    checklistPosts: [],
    checklistPatches: [],
    checklistDeletes: [],
    archives: [],
    log: options.log ?? [],
    checklist: options.checklist ?? [],
  } as unknown as CardFakeApi;
  let ids = 0;

  server.use(
    http.get(url('/cards/:ref'), ({ params }) => {
      const card = state.cards.find((c) => c.ref === params.ref);
      if (!card) {
        return HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'No existe' } },
          { status: 404 },
        );
      }
      return HttpResponse.json({
        ...card,
        checklist: state.checklist,
        log: state.log,
        branchName: `feat/${card.ref}-${card.title.toLowerCase().replace(/\s+/g, '-')}`,
      });
    }),
    http.patch(url('/cards/:ref'), async ({ params, request }) => {
      const body = (await request.json()) as UpdateCardBody;
      state.patches.push({ ref: String(params.ref), body });
      if (state.patchDelay) await delay(state.patchDelay);
      if (state.patchError) {
        return HttpResponse.json(
          { error: { code: 'CONFLICT', message: state.patchError.message } },
          { status: state.patchError.status },
        );
      }
      const card = state.cards.find((c) => c.ref === params.ref);
      if (!card)
        return HttpResponse.json({ error: { code: 'NOT_FOUND', message: '' } }, { status: 404 });
      const { labels, ...rest } = body;
      Object.assign(card, rest);
      if (labels) {
        card.labels = labels.map((name) => ({
          name,
          color: LABELS.find((l) => l.name === name)?.color ?? 'gris',
        }));
      }
      return HttpResponse.json(card);
    }),
    http.post(url('/cards/:ref/archive'), ({ params }) => {
      state.archives.push({ ref: String(params.ref), archive: true });
      const card = state.cards.find((c) => c.ref === params.ref);
      if (card) card.archivedAt = '2026-10-26T12:00:00.000Z';
      return HttpResponse.json(card);
    }),
    http.post(url('/cards/:ref/unarchive'), ({ params }) => {
      state.archives.push({ ref: String(params.ref), archive: false });
      const card = state.cards.find((c) => c.ref === params.ref);
      if (card) card.archivedAt = null;
      return HttpResponse.json(card);
    }),
    http.get(url('/cards/:ref/log'), () => HttpResponse.json(state.log)),
    http.post(url('/cards/:ref/log'), async ({ params, request }) => {
      const body = (await request.json()) as { body: string; occurredAt?: string };
      state.logPosts.push({ ref: String(params.ref), body });
      const entry = makeEntry('note', {
        cardRef: String(params.ref),
        body: body.body,
        occurredAt: body.occurredAt ?? new Date().toISOString(),
      });
      state.log.push(entry);
      return HttpResponse.json(entry, { status: 201 });
    }),
    http.patch(url('/log/:id'), async ({ params, request }) => {
      const body = (await request.json()) as { body?: string };
      state.logPatches.push({ id: String(params.id), body });
      const entry = state.log.find((e) => e.id === params.id);
      if (entry && body.body !== undefined) entry.body = body.body;
      return HttpResponse.json(entry);
    }),
    http.delete(url('/log/:id'), ({ params }) => {
      state.logDeletes.push(String(params.id));
      state.log = state.log.filter((e) => e.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(url('/cards/:ref/checklist'), async ({ params, request }) => {
      const { text } = (await request.json()) as { text: string };
      state.checklistPosts.push({ ref: String(params.ref), text });
      ids += 1;
      const item = makeItem(`00000000-0000-4000-9000-${String(ids).padStart(12, '0')}`, text);
      item.position = state.checklist.length;
      state.checklist.push(item);
      syncCounts(state, String(params.ref));
      return HttpResponse.json(item, { status: 201 });
    }),
    http.patch(url('/checklist/:id'), async ({ params, request }) => {
      const body = (await request.json()) as { text?: string; done?: boolean; position?: number };
      state.checklistPatches.push({ id: String(params.id), body });
      const item = state.checklist.find((i) => i.id === params.id);
      if (item) {
        if (body.text !== undefined) item.text = body.text;
        if (body.done !== undefined) item.done = body.done;
        if (body.position !== undefined) {
          state.checklist = state.checklist.filter((i) => i !== item);
          state.checklist.splice(body.position, 0, item);
          state.checklist.forEach((i, position) => (i.position = position));
        }
      }
      syncCounts(state, 'T-1');
      return HttpResponse.json(item);
    }),
    http.delete(url('/checklist/:id'), ({ params }) => {
      state.checklistDeletes.push(String(params.id));
      state.checklist = state.checklist.filter((i) => i.id !== params.id);
      syncCounts(state, 'T-1');
      return new HttpResponse(null, { status: 204 });
    }),
  );

  const board = renderBoard(initial, options.path ?? '/p/siga', 3, 200, options.otherProjects);
  Object.assign(state, board);
  // `renderBoard` ya había creado `cards`, `moves` y `created`: se comparten las mismas referencias.
  state.cards = board.cards;
  return state;
}
