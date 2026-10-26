import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeCard } from '../../test/board-fixtures';
import { makeItem, renderPanel } from '../../test/card-fixtures';

beforeEach(() => localStorage.clear());

const tile = (ref: string) => document.querySelector<HTMLElement>(`[data-card-ref="${ref}"]`);

const ITEMS = () => [
  makeItem('00000000-0000-4000-a000-000000000001', 'Exportar', false, 0),
  makeItem('00000000-0000-4000-a000-000000000002', 'Validar totales', true, 1),
  makeItem('00000000-0000-4000-a000-000000000003', 'Publicar', false, 2),
];

async function openChecklist() {
  const user = userEvent.setup();
  const api = renderPanel(
    [
      makeCard('todo', {
        number: 1,
        title: 'Migrar facturas',
        checklistDone: 1,
        checklistTotal: 3,
      }),
    ],
    { checklist: ITEMS() },
  );
  await screen.findByText('Migrar facturas');
  tile('T-1')?.focus();
  await user.keyboard('{Enter}');
  const dialog = await screen.findByRole('dialog', { name: 'Migrar facturas' });
  await user.click(await within(dialog).findByRole('tab', { name: /Checklist/ }));
  return { user, api, dialog };
}

describe('pestaña Checklist (5.4, RF-24)', () => {
  it('RF-24: la pestaña muestra 2/5 como el kanban (aquí 1/3) y lista los ítems en orden', async () => {
    const { dialog } = await openChecklist();

    expect(within(dialog).getByRole('tab', { name: 'Checklist 1/3' })).toBeInTheDocument();
    const list = await within(dialog).findByRole('list', { name: 'Ítems del checklist' });
    expect(
      within(list)
        .getAllByRole('button', { name: /^(Exportar|Validar totales|Publicar)$/ })
        .map((b) => b.textContent),
    ).toEqual(['Exportar', 'Validar totales', 'Publicar']);
    expect(within(list).getByRole('checkbox', { name: 'Marcar "Validar totales"' })).toBeChecked();
  });

  it('RF-24: marcar un ítem cambia el 2/5 del kanban sin recargar y se guarda', async () => {
    const { user, api, dialog } = await openChecklist();
    expect(tile('T-1')).toHaveTextContent('1/3');

    await user.click(await within(dialog).findByRole('checkbox', { name: 'Marcar "Exportar"' }));

    expect(tile('T-1')).toHaveTextContent('2/3');
    expect(within(dialog).getByRole('tab', { name: 'Checklist 2/3' })).toBeInTheDocument();
    await waitFor(() =>
      expect(api.checklistPatches).toEqual([
        { id: '00000000-0000-4000-a000-000000000001', body: { done: true } },
      ]),
    );
  });

  it('RF-24: editar el texto en línea (clic, Enter) lo guarda', async () => {
    const { user, api, dialog } = await openChecklist();

    await user.click(await within(dialog).findByRole('button', { name: 'Exportar' }));
    const input = screen.getByRole('textbox', { name: 'Texto del ítem' });
    await user.clear(input);
    await user.type(input, 'Exportar a CSV{Enter}');

    await waitFor(() =>
      expect(api.checklistPatches).toEqual([
        { id: '00000000-0000-4000-a000-000000000001', body: { text: 'Exportar a CSV' } },
      ]),
    );
    expect(await within(dialog).findByRole('button', { name: 'Exportar a CSV' })).toHaveFocus();
  });

  it('RF-24: agregar al pie con Enter crea el ítem y sube el total del kanban', async () => {
    const { user, api, dialog } = await openChecklist();

    await user.type(
      await within(dialog).findByRole('textbox', { name: 'Agregar ítem' }),
      'Avisar{Enter}',
    );

    await waitFor(() => expect(api.checklistPosts).toEqual([{ ref: 'T-1', text: 'Avisar' }]));
    expect(await within(dialog).findByRole('button', { name: 'Avisar' })).toBeInTheDocument();
    expect(tile('T-1')).toHaveTextContent('1/4');
    expect(within(dialog).getByRole('textbox', { name: 'Agregar ítem' })).toHaveValue('');
  });

  it('RF-24: quitar un ítem lo borra y baja el total del kanban', async () => {
    const { user, api, dialog } = await openChecklist();

    await user.click(await within(dialog).findByRole('button', { name: 'Quitar "Publicar"' }));

    await waitFor(() =>
      expect(api.checklistDeletes).toEqual(['00000000-0000-4000-a000-000000000003']),
    );
    expect(tile('T-1')).toHaveTextContent('1/2');
  });

  it('un ítem que la API rechaza se revierte y avisa', async () => {
    const { user, api, dialog } = await openChecklist();
    // El servidor falso no tiene ruta de error: se fuerza respondiendo 500 al PATCH.
    const { server } = await import('../../test/server');
    const { http, HttpResponse } = await import('msw');
    server.use(
      http.patch(`${window.location.origin}/api/v1/checklist/:id`, () =>
        HttpResponse.json({ error: { code: 'INTERNAL', message: 'Falló' } }, { status: 500 }),
      ),
    );

    await user.click(await within(dialog).findByRole('checkbox', { name: 'Marcar "Exportar"' }));

    expect(await screen.findByText(/No se pudo actualizar el ítem: Falló/)).toBeInTheDocument();
    expect(tile('T-1')).toHaveTextContent('1/3');
    expect(api.checklistPatches).toEqual([]);
  });
});
