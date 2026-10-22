import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import type { MeDto, ProjectWithCountsDto } from 'shared';
import { App } from './App';
import { createQueryClient } from './api/query-client';
import { server } from './test/server';

const url = (path: string) => `${window.location.origin}/api/v1${path}`;
const unauthorized = () =>
  HttpResponse.json(
    { error: { code: 'UNAUTHORIZED', message: 'No autenticado' } },
    { status: 401 },
  );

const ME: MeDto = {
  auth: 'session',
  expiresAt: '2026-10-29T12:00:00.000Z',
  idleExpiresAt: '2026-10-22T12:00:00.000Z',
};

const PROJECTS: ProjectWithCountsDto[] = [
  project('Personal', 'personal', 'violeta', 2),
  project('Portafolio', 'portafolio', 'turquesa', 0),
];

function project(
  name: string,
  slug: string,
  color: string,
  inProgress: number,
): ProjectWithCountsDto {
  return {
    id: slug,
    name,
    slug,
    color,
    githubRepo: null,
    wipLimit: 3,
    archivedAt: null,
    createdAt: '2026-10-20T12:00:00.000Z',
    updatedAt: '2026-10-20T12:00:00.000Z',
    cardCounts: { backlog: 0, todo: 0, in_progress: inProgress, review: 0, blocked: 0, done: 0 },
  };
}

function renderApp(path = '/') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App queryClient={createQueryClient()} />
    </MemoryRouter>,
  );
}

function signedIn() {
  server.use(
    http.get(url('/me'), () => HttpResponse.json(ME)),
    http.get(url('/projects'), () => HttpResponse.json(PROJECTS)),
  );
}

beforeEach(() => localStorage.clear());

describe('guard y login (3.4)', () => {
  it('sin sesión, cualquier ruta redirige a /login, sin aviso de sesión vencida', async () => {
    server.use(http.get(url('/me'), unauthorized));

    renderApp('/p/personal/T-1');

    expect(await screen.findByLabelText('Contraseña')).toBeInTheDocument();
    expect(screen.queryByText(/venció/)).not.toBeInTheDocument();
  });

  it('un 401 en plena sesión vuelve a /login con el aviso de sesión vencida', async () => {
    server.use(
      http.get(url('/me'), () => HttpResponse.json(ME)),
      http.get(url('/projects'), unauthorized),
    );

    renderApp('/today');

    expect(await screen.findByText('Tu sesión venció, vuelve a entrar')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
  });

  it('entra con la contraseña, manda el header CSRF y no guarda nada de la sesión', async () => {
    const user = userEvent.setup();
    let loggedIn = false;
    let csrf: string | null = null;
    server.use(
      http.post(url('/auth/login'), ({ request }) => {
        csrf = request.headers.get('X-Logbook-CSRF');
        loggedIn = true;
        return new HttpResponse(null, { status: 204 });
      }),
      http.get(url('/me'), () => (loggedIn ? HttpResponse.json(ME) : unauthorized())),
      http.get(url('/projects'), () => HttpResponse.json(PROJECTS)),
    );
    renderApp('/week');
    await user.type(await screen.findByLabelText('Contraseña'), 'secreta');

    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Mi semana' })).toBeInTheDocument();
    expect(csrf).toBe('1');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('contraseña incorrecta (401) y demasiados intentos (429) tienen su propio mensaje', async () => {
    const user = userEvent.setup();
    let status = 401;
    server.use(
      http.get(url('/me'), unauthorized),
      http.post(url('/auth/login'), () =>
        HttpResponse.json({ error: { code: 'X', message: 'x' } }, { status }),
      ),
    );
    renderApp('/login');
    await user.type(await screen.findByLabelText('Contraseña'), 'mala');

    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Contraseña incorrecta');

    status = 429;
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('Demasiados intentos, espera 15 minutos')).toBeInTheDocument();
  });
});

describe('AppShell (3.4, 3.5)', () => {
  it('lista los proyectos reales en la sidebar y /p/:slug muestra su nombre como h1', async () => {
    signedIn();

    renderApp('/p/personal');

    const nav = await screen.findByRole('navigation', { name: 'Principal' });
    expect(await within(nav).findByRole('link', { name: /Personal/ })).toHaveAttribute(
      'href',
      '/p/personal',
    );
    expect(within(nav).getByRole('link', { name: /Portafolio/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Personal' })).toBeInTheDocument();
  });

  it('[ colapsa la sidebar y la preferencia se recuerda', async () => {
    const user = userEvent.setup();
    signedIn();
    renderApp('/today');
    const toggle = await screen.findByRole('button', { name: 'Colapsar barra lateral' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('[[');

    expect(screen.getByRole('button', { name: 'Expandir barra lateral' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(localStorage.getItem('logbook.sidebarCollapsed')).toBe('1');
  });

  it('g d / g w / g t navegan y ? abre la tabla de atajos', async () => {
    const user = userEvent.setup();
    signedIn();
    renderApp('/today');
    await screen.findByRole('heading', { level: 1, name: 'Mi día' });

    await user.keyboard('gw');
    expect(await screen.findByRole('heading', { level: 1, name: 'Mi semana' })).toBeInTheDocument();
    await user.keyboard('gt');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Línea de tiempo' }),
    ).toBeInTheDocument();

    await user.keyboard('?');
    expect(screen.getByRole('dialog', { name: 'Atajos de teclado' })).toBeVisible();
  });

  it('M-1 §6.1: el contador "en curso" forma parte del nombre del enlace, sin aria-label en un span', async () => {
    signedIn();
    renderApp('/today');

    const nav = await screen.findByRole('navigation', { name: 'Principal' });

    expect(await within(nav).findByRole('link', { name: 'Personal, 2 en curso' })).toBeVisible();
    expect(nav.querySelector('span[aria-label]')).toBeNull();
    expect(nav.querySelector('[title]')).toBeNull();
  });

  it('M-2 §6.1: colapsada, el enlace no se anuncia dos veces (nombre y descripción distintos)', async () => {
    const user = userEvent.setup();
    localStorage.setItem('logbook.sidebarCollapsed', '1');
    signedIn();
    renderApp('/today');
    const nav = await screen.findByRole('navigation', { name: 'Principal' });
    const link = await within(nav).findByRole('link', { name: 'Mi día' });

    await user.hover(link);

    expect(link).not.toHaveAccessibleDescription('Mi día');
  });

  it('M-10 §6.1: la sidebar no crea regiones (landmarks) de más', async () => {
    signedIn();
    renderApp('/today');
    const nav = await screen.findByRole('navigation', { name: 'Principal' });

    expect(within(nav).queryAllByRole('region')).toHaveLength(0);
    expect(within(nav).getByRole('group', { name: 'Vistas' })).toBeInTheDocument();
  });

  describe('bajo 1024 px (M-3 §3)', () => {
    const original = window.matchMedia;
    beforeEach(() => {
      window.matchMedia = ((query: string) => ({
        matches: true,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })) as unknown as typeof window.matchMedia;
    });
    afterEach(() => {
      window.matchMedia = original;
    });

    it('el botón de la sidebar queda aria-disabled y [ no cambia la preferencia', async () => {
      const user = userEvent.setup();
      signedIn();
      renderApp('/today');
      const toggle = await screen.findByRole('button', { name: 'Expandir barra lateral' });

      expect(toggle).toHaveAttribute('aria-disabled', 'true');
      await user.click(toggle);
      await user.keyboard('[[');

      expect(localStorage.getItem('logbook.sidebarCollapsed')).toBeNull();
      await user.hover(toggle);
      expect(await screen.findByRole('tooltip')).toHaveTextContent(
        'La barra lateral se colapsa bajo 1024 px',
      );
    });
  });
});
