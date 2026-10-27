import { useState } from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router';
import { createQueryClient } from './api/query-client';
import { ApiBridge } from './app/ApiBridge';
import { RequireAuth } from './app/RequireAuth';
import { AppShell } from './components/layout/AppShell';
import { ToastProvider } from './components/ui/Toast';
import { BoardPage } from './pages/BoardPage';
import { KitPage } from './pages/KitPage';
import { LabelsPage } from './pages/LabelsPage';
import { LoginPage } from './pages/LoginPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { SettingsPage } from './pages/SettingsPage';
import { TodayPage } from './pages/TodayPage';
import { TokensPage } from './pages/TokensPage';
import { WeekPage } from './pages/WeekPage';

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
              <Route path="today" element={<TodayPage />} />
              <Route path="week" element={<WeekPage />} />
              <Route
                path="timeline"
                element={<PlaceholderPage note="La línea de tiempo llega en la fase 9." />}
              />
              <Route path="p/:slug" element={<BoardPage />}>
                {/* El detalle es un panel sobre el tablero (§3): BoardPage lee `:ref` y lo dibuja. */}
                <Route path=":ref" element={null} />
              </Route>
              <Route path="labels" element={<LabelsPage />} />
              <Route path="tokens" element={<TokensPage />} />
              <Route path="settings" element={<SettingsPage />} />
              {/* Solo en desarrollo (D-4): Vite sustituye DEV por false y saca KitPage del bundle. */}
              {import.meta.env.DEV && <Route path="_kit" element={<KitPage />} />}
              <Route path="*" element={<PlaceholderPage note="Esta página no existe." />} />
            </Route>
          </Route>
        </Routes>
      </ToastProvider>
    </QueryClientProvider>
  );
}
