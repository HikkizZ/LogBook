import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { SettingsDto } from 'shared';
import { server } from '../test/server';
import { renderAdmin, url } from '../test/admin-fixtures';
import { SettingsPage } from './SettingsPage';

const SAVED: SettingsDto = { timezone: 'America/Santiago', doneDaysVisible: 14, wipDefault: 3 };

function fakeSettingsApi() {
  const state = {
    patches: [] as Record<string, unknown>[],
    posts: [] as string[],
  };
  server.use(
    http.get(url('/settings'), () => HttpResponse.json(SAVED)),
    http.patch(url('/settings'), async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      state.patches.push(body);
      return HttpResponse.json({ ...SAVED, ...body });
    }),
    http.post(url('/auth/logout'), () => {
      state.posts.push('logout');
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(url('/auth/logout-all'), () => {
      state.posts.push('logout-all');
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return state;
}

async function ready() {
  return screen.findByLabelText('Zona horaria');
}

describe('Ajustes (4.8)', () => {
  it('muestra los valores guardados y Guardar está deshabilitado sin cambios', async () => {
    fakeSettingsApi();
    renderAdmin(<SettingsPage />);

    expect(await ready()).toHaveValue('America/Santiago');
    expect(screen.getByLabelText('Días visibles en Hecho')).toHaveValue('14');
    expect(screen.getByLabelText('WIP por defecto')).toHaveValue('3');
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('PATCH manda solo lo que cambió', async () => {
    const api = fakeSettingsApi();
    renderAdmin(<SettingsPage />);
    const user = userEvent.setup();
    await ready();

    const days = screen.getByLabelText('Días visibles en Hecho');
    await user.clear(days);
    await user.type(days, '30');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(api.patches).toEqual([{ doneDaysVisible: 30 }]));
    expect(await screen.findByText('Ajustes guardados')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it.each([
    ['Días visibles en Hecho', '0', 'entre 1 y 365'],
    ['Días visibles en Hecho', '366', 'entre 1 y 365'],
    ['WIP por defecto', '32768', 'entre 0 y 32767'],
    ['WIP por defecto', '-1', 'entre 0 y 32767'],
    ['WIP por defecto', '2.5', 'entre 0 y 32767'],
    ['Zona horaria', 'Marte/Olympus', 'inválida'],
  ])('valida rangos: %s = %s no se envía', async (field, value, message) => {
    const api = fakeSettingsApi();
    renderAdmin(<SettingsPage />);
    const user = userEvent.setup();
    await ready();

    const input = screen.getByLabelText(field);
    await user.clear(input);
    await user.type(input, value);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(api.patches).toEqual([]);
  });

  it('acepta los extremos de los rangos (365 y 0)', async () => {
    const api = fakeSettingsApi();
    renderAdmin(<SettingsPage />);
    const user = userEvent.setup();
    await ready();

    for (const [field, value] of [
      ['Días visibles en Hecho', '365'],
      ['WIP por defecto', '0'],
    ] as const) {
      const input = screen.getByLabelText(field);
      await user.clear(input);
      await user.type(input, value);
    }
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(api.patches).toEqual([{ doneDaysVisible: 365, wipDefault: 0 }]));
  });

  it('RF-63: "Salir" llama a /auth/logout sin confirmación y lleva a /login', async () => {
    const api = fakeSettingsApi();
    renderAdmin(<SettingsPage />);
    const user = userEvent.setup();
    await ready();

    await user.click(screen.getByRole('button', { name: 'Salir' }));

    expect(await screen.findByText('Pantalla de login')).toBeInTheDocument();
    expect(api.posts).toEqual(['logout']);
  });

  it('RF-64: "Cerrar todas las sesiones" pide confirmación, llama a logout-all, limpia la caché y va a /login', async () => {
    const api = fakeSettingsApi();
    const { queryClient } = renderAdmin(<SettingsPage />);
    const user = userEvent.setup();
    await ready();

    await user.click(screen.getByRole('button', { name: 'Cerrar todas las sesiones' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Los tokens de API no se tocan');
    expect(api.posts).toEqual([]);

    await user.click(within(dialog).getByRole('button', { name: 'Cerrar todas' }));

    expect(await screen.findByText('Pantalla de login')).toBeInTheDocument();
    expect(api.posts).toEqual(['logout-all']);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('RF-64: cancelar la confirmación no cierra sesiones', async () => {
    const api = fakeSettingsApi();
    renderAdmin(<SettingsPage />);
    const user = userEvent.setup();
    await ready();

    await user.click(screen.getByRole('button', { name: 'Cerrar todas las sesiones' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Pantalla de login')).toBeNull();
    expect(api.posts).toEqual([]);
  });
});
