import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LoginBody } from 'shared';
import { useLocation, useNavigate } from 'react-router';
import { ApiError, api } from '../api/client';
import { queryKeys } from '../api/queries';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

function loginErrorMessage(error: Error): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Contraseña incorrecta';
    if (error.status === 429) return 'Demasiados intentos, espera 15 minutos';
    // 403 ya lo avisa un toast global (falta de CSRF = bug de la UI).
    if (error.status === 403) return '';
  }
  return error.message;
}

/** Destino tras entrar: la ruta que provocó el 401, si es interna; si no, Mi día. */
function destination(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')
    ? from
    : '/today';
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const expired = (location.state as { expired?: boolean } | null)?.expired === true;

  const login = useMutation({
    mutationFn: (body: LoginBody) =>
      api.post<undefined>('/auth/login', body, { skipUnauthorizedHandler: true }),
    onSuccess: () => {
      // La cookie `httpOnly` ya quedó puesta por la API; solo se descarta lo que hubiera en caché.
      queryClient.removeQueries({ queryKey: queryKeys.me });
      void navigate(destination(location.state), { replace: true });
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ password });
  };
  const errorMessage = login.error ? loginErrorMessage(login.error) : '';

  return (
    <main className="grid min-h-screen place-items-center bg-bg p-4">
      <div className="w-full max-w-login rounded-md border border-border bg-surface p-6 shadow-card">
        <h1 className="mb-5 text-md">Logbook</h1>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="password">Contraseña</label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={errorMessage ? true : undefined}
              aria-describedby={errorMessage ? 'login-error' : undefined}
            />
            {errorMessage && (
              <p id="login-error" role="alert" className="text-sm text-danger">
                {errorMessage}
              </p>
            )}
          </div>
          <Button type="submit" disabled={login.isPending}>
            Entrar
          </Button>
        </form>
        {expired && (
          <p role="status" className="mt-4 text-sm text-fg-muted">
            Tu sesión venció, vuelve a entrar
          </p>
        )}
      </div>
    </main>
  );
}
