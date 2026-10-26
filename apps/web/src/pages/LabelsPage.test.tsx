import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { LabelDto } from 'shared';
import { server } from '../test/server';
import { renderAdmin, url } from '../test/admin-fixtures';
import { LabelsPage } from './LabelsPage';

function label(id: string, name: string, color = 'gris'): LabelDto {
  return { id, name, color, createdAt: '2026-10-01T12:00:00.000Z' };
}

function fakeLabelsApi(initial: LabelDto[], cardsWithLabel = 3) {
  const state = {
    labels: [...initial],
    posts: [] as unknown[],
    patches: [] as { id: string; body: Record<string, unknown> }[],
    deleted: [] as string[],
  };
  const duplicate = (name: string, exceptId?: string) =>
    state.labels.some((l) => l.id !== exceptId && l.name.toLowerCase() === name.toLowerCase());
  const conflict = () =>
    HttpResponse.json(
      { error: { code: 'CONFLICT', message: 'La etiqueta ya existe' } },
      { status: 409 },
    );
  server.use(
    http.get(url('/labels'), () => HttpResponse.json(state.labels)),
    http.get(url('/cards'), () =>
      HttpResponse.json({
        items: Array.from({ length: cardsWithLabel }, (_, i) => ({ id: `c${i}` })),
        nextCursor: null,
      }),
    ),
    http.post(url('/labels'), async ({ request }) => {
      const body = (await request.json()) as { name: string; color: string };
      state.posts.push(body);
      if (duplicate(body.name)) return conflict();
      const created = label(`n${state.labels.length}`, body.name, body.color);
      state.labels.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch(url('/labels/:id'), async ({ request, params }) => {
      const id = String(params.id);
      const body = (await request.json()) as { name?: string; color?: string };
      state.patches.push({ id, body });
      if (body.name && duplicate(body.name, id)) return conflict();
      const target = state.labels.find((l) => l.id === id);
      if (!target) return new HttpResponse(null, { status: 404 });
      Object.assign(target, body);
      return HttpResponse.json(target);
    }),
    http.delete(url('/labels/:id'), ({ params }) => {
      state.deleted.push(String(params.id));
      state.labels = state.labels.filter((l) => l.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return state;
}

describe('Etiquetas (RF-23, 4.8)', () => {
  it('RF-23: crea una etiqueta con nombre y color', async () => {
    const api = fakeLabelsApi([label('l1', 'bug', 'magenta')]);
    renderAdmin(<LabelsPage />);
    const user = userEvent.setup();
    await screen.findByLabelText('Nombre de la etiqueta bug');

    await user.type(screen.getByLabelText('Nombre de la nueva etiqueta'), '  infra ');
    await user.selectOptions(screen.getByLabelText('Color de la nueva etiqueta'), 'turquesa');
    await user.click(screen.getByRole('button', { name: /Añadir/ }));

    expect(await screen.findByLabelText('Nombre de la etiqueta infra')).toBeInTheDocument();
    expect(api.posts).toEqual([{ name: 'infra', color: 'turquesa' }]);
  });

  it('RF-23: crear una etiqueta duplicada (409) muestra el error y no la agrega', async () => {
    fakeLabelsApi([label('l1', 'bug')]);
    renderAdmin(<LabelsPage />);
    const user = userEvent.setup();
    await screen.findByLabelText('Nombre de la etiqueta bug');

    await user.type(screen.getByLabelText('Nombre de la nueva etiqueta'), 'BUG');
    await user.click(screen.getByRole('button', { name: /Añadir/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya existe una etiqueta con ese nombre',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('RF-23: renombrar al salir del campo manda un PATCH solo con el nombre', async () => {
    const api = fakeLabelsApi([label('l1', 'bug', 'magenta')]);
    renderAdmin(<LabelsPage />);
    const user = userEvent.setup();
    const input = await screen.findByLabelText('Nombre de la etiqueta bug');

    await user.clear(input);
    await user.type(input, 'defecto{Enter}');

    expect(await screen.findByLabelText('Nombre de la etiqueta defecto')).toBeInTheDocument();
    expect(api.patches).toEqual([{ id: 'l1', body: { name: 'defecto' } }]);
  });

  it('RF-23: renombrar a un nombre existente (409) revierte y avisa', async () => {
    const api = fakeLabelsApi([label('l1', 'bug'), label('l2', 'docs')]);
    renderAdmin(<LabelsPage />);
    const user = userEvent.setup();
    const input = await screen.findByLabelText('Nombre de la etiqueta bug');

    await user.clear(input);
    await user.type(input, 'docs{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe');
    expect(screen.getByLabelText('Nombre de la etiqueta bug')).toHaveValue('bug');
    expect(api.patches).toHaveLength(1);
  });

  it('RF-23: cambiar el color manda un PATCH solo con el color', async () => {
    const api = fakeLabelsApi([label('l1', 'bug')]);
    renderAdmin(<LabelsPage />);
    const user = userEvent.setup();

    await user.selectOptions(await screen.findByLabelText('Color de bug'), 'oliva');

    await waitFor(() => expect(api.patches).toEqual([{ id: 'l1', body: { color: 'oliva' } }]));
  });

  it('RF-23: borrar pide confirmación con el número de tarjetas y la quita', async () => {
    const api = fakeLabelsApi([label('l1', 'bug'), label('l2', 'docs')], 3);
    renderAdmin(<LabelsPage />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Borrar bug' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Se quita de 3 tarjetas.')).toBeInTheDocument();
    expect(api.deleted).toEqual([]);

    await user.click(within(dialog).getByRole('button', { name: 'Borrar' }));

    await waitFor(() => expect(api.deleted).toEqual(['l1']));
    await waitFor(() => expect(screen.queryByLabelText('Nombre de la etiqueta bug')).toBeNull());
  });

  it('RF-23: cancelar el borrado no llama a la API', async () => {
    const api = fakeLabelsApi([label('l1', 'bug')]);
    renderAdmin(<LabelsPage />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Borrar bug' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.deleted).toEqual([]);
  });
});
