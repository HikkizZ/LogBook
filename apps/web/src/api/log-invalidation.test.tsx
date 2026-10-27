import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { ToastProvider } from '../components/ui/Toast';
import { makeCard, url } from '../test/board-fixtures';
import { makeEntry } from '../test/card-fixtures';
import { server } from '../test/server';
import {
  useAddLogEntry,
  useArchiveCard,
  useDeleteLogEntry,
  useEditLogEntry,
  useUpdateCard,
} from './card-queries';
import { logQueryKeys } from './log-queries';
import { createQueryClient } from './query-client';
import { useMoveCard } from './queries';

const FILTERS = { from: '2026-10-20', to: '2026-10-20', project: null };
const entry = makeEntry('note', { cardRef: 'T-1' });
const card = makeCard('todo', { number: 1 });

/** Monta el hook con una vista de Mi día/semana ya en caché y comprueba que la mutación la invalida. */
async function expectsLogInvalidated<T>(useHook: () => T, run: (hook: T) => Promise<unknown>) {
  server.use(
    http.post(url('/cards/T-1/log'), () => HttpResponse.json(entry)),
    http.patch(url('/log/:id'), () => HttpResponse.json(entry)),
    http.delete(url('/log/:id'), () => new HttpResponse(null, { status: 204 })),
    http.post(url('/cards/T-1/move'), () => HttpResponse.json({ ...card, status: 'in_progress' })),
    http.patch(url('/cards/T-1'), () => HttpResponse.json(card)),
    http.post(url('/cards/T-1/archive'), () => HttpResponse.json(card)),
  );
  const qc = createQueryClient();
  const key = logQueryKeys.log(FILTERS);
  qc.setQueryData(key, { days: [], moved: [] });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
  const { result } = renderHook(useHook, { wrapper });
  expect(qc.getQueryState(key)?.isInvalidated).toBe(false);

  await run(result.current);

  await waitFor(() => expect(qc.getQueryState(key)?.isInvalidated).toBe(true));
}

describe('I-2: Mi día/semana se refrescan tras escribir, mover o archivar', () => {
  it('I-2 RF-40: añadir una nota invalida la bitácora', async () => {
    await expectsLogInvalidated(useAddLogEntry, (m) => m.mutateAsync({ ref: 'T-1', body: 'x' }));
  });

  it('I-2 RF-40: editar una nota invalida la bitácora', async () => {
    await expectsLogInvalidated(useEditLogEntry, (m) => m.mutateAsync({ entry, body: 'y' }));
  });

  it('I-2 RF-40: borrar una nota invalida la bitácora', async () => {
    await expectsLogInvalidated(useDeleteLogEntry, (m) => m.mutateAsync(entry));
  });

  it('I-2 RF-42: mover una tarjeta invalida la bitácora', async () => {
    await expectsLogInvalidated(
      () => useMoveCard('siga'),
      (m) => m.mutateAsync({ ref: 'T-1', status: 'in_progress' }),
    );
  });

  it('I-2 RF-42: editar una tarjeta invalida la bitácora', async () => {
    await expectsLogInvalidated(
      () => useUpdateCard('T-1'),
      (m) => m.mutateAsync({ title: 'Otro' }),
    );
  });

  it('I-2 RF-40: archivar una tarjeta invalida la bitácora', async () => {
    await expectsLogInvalidated(
      () => useArchiveCard('T-1'),
      (m) => m.mutateAsync(true),
    );
  });
});
