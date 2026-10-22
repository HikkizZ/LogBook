import { useState } from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router';
import { createQueryClient } from './api/query-client';
import { ApiBridge } from './app/ApiBridge';
import { RequireAuth } from './app/RequireAuth';
import { AppShell } from './components/layout/AppShell';
import { ToastProvider } from './components/ui/Toast';
import { KitPage } from './pages/KitPage';
import { LoginPage } from './pages/LoginPage';
import { PlaceholderPage } from './pages/PlaceholderPage';

export function App({ queryClient }: { queryClient?: QueryClient }) {
  const [client] = useState(() => queryClient ?? createQueryClient());

  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ApiBridge />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route index element={<Navigate to="/today" replace />} />
              <Route path="today" element={<PlaceholderPage note="Mi día llega en la fase 6." />} />
              <Route
                path="week"
                element={<PlaceholderPage note="Mi semana llega en la fase 6." />}
              />
              <Route
                path="timeline"
                element={<PlaceholderPage note="La línea de tiempo llega en la fase 9." />}
              />
              <Route
                path="p/:slug"
                element={<PlaceholderPage note="El kanban llega en la fase 4." />}
              />
              <Route
                path="p/:slug/:ref"
                element={<PlaceholderPage note="El detalle de tarjeta llega en la fase 5." />}
              />
              <Route
                path="labels"
                element={<PlaceholderPage note="Etiquetas llega en la fase 5." />}
              />
              <Route
                path="tokens"
                element={<PlaceholderPage note="Tokens llega en la fase 5." />}
              />
              <Route
                path="settings"
                element={<PlaceholderPage note="Ajustes llega en la fase 5." />}
              />
              <Route path="_kit" element={<KitPage />} />
              <Route path="*" element={<PlaceholderPage note="Esta página no existe." />} />
            </Route>
          </Route>
        </Routes>
      </ToastProvider>
    </QueryClientProvider>
  );
}
