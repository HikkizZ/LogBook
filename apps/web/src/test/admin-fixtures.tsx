import { render } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { createQueryClient } from '../api/query-client';
import { ApiBridge } from '../app/ApiBridge';
import { ToastProvider } from '../components/ui/Toast';

export { url } from './board-fixtures';

/** Renderiza una página de administración sola, con `/login` como destino reconocible. */
export function renderAdmin(page: ReactElement): { queryClient: QueryClient } {
  const queryClient = createQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/page']}>
          <ApiBridge />
          <Routes>
            <Route path="/page" element={page} />
            <Route path="/login" element={<p>Pantalla de login</p>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { queryClient };
}
