import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { ApiTokenDto } from '../api/admin-queries';
import { server } from '../test/server';
import { renderAdmin, url } from '../test/admin-fixtures';
import { TokensPage } from './TokensPage';

const NOW = new Date('2026-10-26T15:00:00.000Z');
const SECRET = 'lb_AbCdEfGh.SECRETSECRETSECRETSECRETSECRETSECRET1';
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();

function token(id: string, name: string, extra: Partial<ApiTokenDto> = {}): ApiTokenDto {
  return {
    id,
    name,
    prefix: 'lb_AbCdEfGh',
    lastUsedAt: null,
    createdAt: '2026-08-01T12:00:00.000Z',
    expiresAt: inDays(60),
    revokedAt: null,
    ...extra,
  };
}

function fakeTokensApi(initial: ApiTokenDto[]) {
  const state = { tokens: [...initial], created: [] as string[], revoked: [] as string[] };
  server.use(
    http.get(url('/settings'), () =>
      HttpResponse.json({ timezone: 'America/Santiago', doneDaysVisible: 14, wipDefault: 3 }),
    ),
    http.get(url('/tokens'), () => HttpResponse.json(state.tokens)),
    http.post(url('/tokens'), async ({ request }) => {
      const { name } = (await request.json()) as { name: string };
      state.created.push(name);
      state.tokens.unshift(token('new', name, { expiresAt: inDays(90) }));
      return HttpResponse.json(
        { id: 'new', name, prefix: 'lb_AbCdEfGh', token: SECRET, expiresAt: inDays(90) },
        { status: 201 },
      );
    }),
    http.delete(url('/tokens/:id'), ({ params }) => {
      state.revoked.push(String(params.id));
      const t = state.tokens.find((x) => x.id === params.id);
      if (t) t.revokedAt = NOW.toISOString();
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return state;
}

// Solo `Date` simulada: los temporizadores reales siguen sirviendo a msw y Testing Library.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
});
afterEach(() => vi.useRealTimers());

const cell = (name: string) => screen.findByText(name, { selector: 'td' });
const rowOf = (el: HTMLElement) => el.closest('tr') as HTMLElement;

describe('Tokens (RF-61, 4.7)', () => {
  it('RF-61: a 10 días del vencimiento muestra el chip ámbar "vence en 10 días" y la franja', async () => {
    fakeTokensApi([token('t1', 'Claude Code PC', { expiresAt: inDays(10) })]);
    renderAdmin(<TokensPage />);

    const row = rowOf(await cell('Claude Code PC'));

    expect(within(row).getByText('vence en 10 días')).toBeInTheDocument();
    expect(screen.getByText(/Crea uno nuevo y actualiza el/)).toHaveTextContent('Claude Code PC');
  });

  it('RF-61: a 20 días no hay chip ni franja', async () => {
    fakeTokensApi([token('t1', 'Claude Code PC', { expiresAt: inDays(20) })]);
    renderAdmin(<TokensPage />);

    await cell('Claude Code PC');

    expect(screen.queryByText(/vence en/)).toBeNull();
    expect(screen.queryByText(/Crea uno nuevo y actualiza el/)).toBeNull();
  });

  it('RF-61: el límite de 14 días avisa y el de 15 no', async () => {
    fakeTokensApi([
      token('t1', 'Catorce', { expiresAt: inDays(14) }),
      token('t2', 'Quince', { expiresAt: inDays(15) }),
    ]);
    renderAdmin(<TokensPage />);

    const catorce = rowOf(await cell('Catorce'));
    const quince = rowOf(await cell('Quince'));

    expect(within(catorce).getByText('vence en 14 días')).toBeInTheDocument();
    expect(within(quince).queryByText(/vence en/)).toBeNull();
  });

  it('RF-61: un token vencido muestra "vencido", atenuado y sin franja', async () => {
    fakeTokensApi([token('t1', 'Viejo', { expiresAt: inDays(-1) })]);
    renderAdmin(<TokensPage />);

    const row = rowOf(await cell('Viejo'));

    expect(within(row).getByText('vencido')).toBeInTheDocument();
    expect(row).toHaveClass('opacity-60');
    expect(screen.queryByText(/Crea uno nuevo y actualiza el/)).toBeNull();
  });

  it('RF-61: un token revocado muestra "revocado", sin botón Revocar y sin franja', async () => {
    fakeTokensApi([token('t1', 'Caído', { expiresAt: inDays(5), revokedAt: inDays(-1) })]);
    renderAdmin(<TokensPage />);

    const row = rowOf(await cell('Caído'));

    expect(within(row).getByText('revocado')).toBeInTheDocument();
    expect(within(row).queryByRole('button')).toBeNull();
    expect(row).toHaveClass('opacity-60');
    expect(screen.queryByText(/Crea uno nuevo y actualiza el/)).toBeNull();
  });

  it('RF-61: revocar pide confirmación y recién entonces llama a DELETE', async () => {
    const api = fakeTokensApi([token('t1', 'Claude Code PC')]);
    renderAdmin(<TokensPage />);
    const user = userEvent.setup();
    const row = rowOf(await cell('Claude Code PC'));

    await user.click(within(row).getByRole('button', { name: 'Revocar Claude Code PC' }));
    const dialog = await screen.findByRole('dialog');
    expect(api.revoked).toEqual([]);

    await user.click(within(dialog).getByRole('button', { name: 'Revocar' }));

    await waitFor(() => expect(api.revoked).toEqual(['t1']));
    expect(await screen.findByText('revocado')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('RF-61: cancelar la revocación no llama a la API', async () => {
    const api = fakeTokensApi([token('t1', 'Claude Code PC')]);
    renderAdmin(<TokensPage />);
    const user = userEvent.setup();
    await cell('Claude Code PC');

    await user.click(screen.getByRole('button', { name: 'Revocar Claude Code PC' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.revoked).toEqual([]);
  });

  it('RF-61: el token nuevo se muestra una vez con su vencimiento y no queda en ninguna caché ni tras cerrar', async () => {
    const api = fakeTokensApi([]);
    const { queryClient } = renderAdmin(<TokensPage />);
    const user = userEvent.setup();
    await screen.findByText('Aún no hay tokens.');

    await user.click(screen.getByRole('button', { name: /Nuevo token/ }));
    await user.type(screen.getByLabelText('Nombre'), 'Skill portátil');
    await user.click(screen.getByRole('button', { name: 'Crear token' }));

    expect(await screen.findByTestId('new-token')).toHaveTextContent(SECRET);
    expect(screen.getByText(/No se vuelve\s+a mostrar/)).toBeInTheDocument();
    expect(screen.getByText(/Vence el .* \(90 días\)/)).toBeInTheDocument();
    expect(api.created).toEqual(['Skill portátil']);

    const inCaches = () =>
      JSON.stringify([
        queryClient
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
        queryClient
          .getMutationCache()
          .getAll()
          .map((m) => m.state),
      ]).includes(SECRET);
    expect(inCaches()).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Listo' }));

    expect(screen.queryByTestId('new-token')).toBeNull();
    expect(document.body.textContent).not.toContain(SECRET);
    expect(inCaches()).toBe(false);
    // La lista refrescada muestra el token solo por su prefijo.
    expect(await screen.findByText('lb_AbCdEfGh')).toBeInTheDocument();

    // Reabrir el diálogo no recupera el token.
    await user.click(screen.getByRole('button', { name: /Nuevo token/ }));
    expect(screen.queryByTestId('new-token')).toBeNull();
  });

  it('D2026-10-26 #3 (I-4): el foco inicial del token nuevo está en "Copiar"; tras copiar pasa a "Listo"', async () => {
    fakeTokensApi([]);
    renderAdmin(<TokensPage />);
    const user = userEvent.setup();
    await screen.findByText('Aún no hay tokens.');

    await user.click(screen.getByRole('button', { name: /Nuevo token/ }));
    await user.type(screen.getByLabelText('Nombre'), 'X{Enter}');
    await screen.findByTestId('new-token');

    expect(screen.getByRole('button', { name: 'Copiar' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText('Copiado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Listo' })).toHaveFocus();
  });

  it('RF-61: copiar manda el token al portapapeles', async () => {
    fakeTokensApi([]);
    renderAdmin(<TokensPage />);
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    await screen.findByText('Aún no hay tokens.');

    await user.click(screen.getByRole('button', { name: /Nuevo token/ }));
    await user.type(screen.getByLabelText('Nombre'), 'X');
    await user.click(screen.getByRole('button', { name: 'Crear token' }));
    await screen.findByTestId('new-token');
    await user.click(screen.getByRole('button', { name: 'Copiar' }));

    expect(writeText).toHaveBeenCalledWith(SECRET);
    expect(await screen.findByText('Copiado')).toBeInTheDocument();
  });

  it('M-6 §5: un 401 al revocar lleva a /login sin toast de error encima', async () => {
    fakeTokensApi([token('t1', 'Claude Code PC')]);
    server.use(
      http.delete(url('/tokens/:id'), () =>
        HttpResponse.json(
          { error: { code: 'UNAUTHORIZED', message: 'Sesión no válida' } },
          { status: 401 },
        ),
      ),
    );
    renderAdmin(<TokensPage />);
    const user = userEvent.setup();
    await cell('Claude Code PC');

    await user.click(screen.getByRole('button', { name: 'Revocar Claude Code PC' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Revocar' }),
    );

    expect(await screen.findByText('Pantalla de login')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByText(/Sesión no válida/)).not.toBeInTheDocument();
  });

  it('exige un nombre antes de crear', async () => {
    const api = fakeTokensApi([]);
    renderAdmin(<TokensPage />);
    const user = userEvent.setup();
    await screen.findByText('Aún no hay tokens.');

    await user.click(screen.getByRole('button', { name: /Nuevo token/ }));
    await user.click(screen.getByRole('button', { name: 'Crear token' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Escribe un nombre');
    expect(api.created).toEqual([]);
  });
});
