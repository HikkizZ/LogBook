import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeCard } from '../../test/board-fixtures';
import { renderPanel } from '../../test/card-fixtures';

beforeEach(() => localStorage.clear());

const tile = (ref: string) => document.querySelector<HTMLElement>(`[data-card-ref="${ref}"]`);
const location = () => screen.getByTestId('location');

const CARD = () =>
  makeCard('todo', { number: 1, title: 'Migrar facturas', description: 'Texto', priority: 'high' });

async function openWithEnter(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText('Migrar facturas');
  tile('T-1')?.focus();
  await user.keyboard('{Enter}');
  return screen.findByRole('dialog', { name: 'Migrar facturas' });
}

describe('panel de detalle (5.1)', () => {
  it('§4.2: Enter sobre la tarjeta abre el panel como diálogo con el título por nombre y la URL /p/:slug/:ref', async () => {
    const user = userEvent.setup();
    renderPanel([CARD()]);

    const dialog = await openWithEnter(user);

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(location()).toHaveTextContent('/p/siga/T-1');
    expect(within(dialog).getByText('T-1')).toBeInTheDocument();
    expect(within(dialog).getByText('feat/T-1-migrar-facturas')).toBeInTheDocument();
  });

  it('§4.2: el clic en una tarjeta también abre el panel', async () => {
    const user = userEvent.setup();
    renderPanel([CARD()]);

    await user.click(await screen.findByText('Migrar facturas'));

    expect(await screen.findByRole('dialog', { name: 'Migrar facturas' })).toBeInTheDocument();
  });

  it('§6.1: Esc cierra el panel y devuelve el foco a la tarjeta del kanban, sin perder los filtros', async () => {
    const user = userEvent.setup();
    renderPanel([CARD()], { path: '/p/siga?priority=high' });
    await screen.findByText('Migrar facturas');
    tile('T-1')?.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('dialog', { name: 'Migrar facturas' });
    expect(location()).toHaveTextContent('/p/siga/T-1?priority=high');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(location()).toHaveTextContent(/^\/p\/siga\?priority=high$/);
    expect(tile('T-1')).toHaveFocus();
  });

  it('§3: el clic fuera del panel lo cierra', async () => {
    const user = userEvent.setup();
    renderPanel([CARD()]);
    await openWithEnter(user);

    fireEvent.mouseDown(document.querySelector('.fixed.inset-0.z-40') as HTMLElement);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('§6.1: el foco queda atrapado en el panel (Tab desde el último vuelve al primero)', async () => {
    const user = userEvent.setup();
    renderPanel([CARD()]);
    const dialog = await openWithEnter(user);
    await within(dialog).findByRole('tab', { name: 'Bitácora' });
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, textarea'),
    ).filter((el) => el.tabIndex >= 0);
    const first = focusables[0] as HTMLElement;
    const last = focusables[focusables.length - 1] as HTMLElement;

    last.focus();
    await user.tab();
    expect(first).toHaveFocus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  it('M-7 (fase 4): los filtros del tablero siguen visibles con el panel abierto', async () => {
    const user = userEvent.setup();
    renderPanel([CARD()]);
    await openWithEnter(user);

    expect(screen.getByRole('textbox', { name: 'Filtrar por texto' })).toBeInTheDocument();
  });

  it('RF-20: el botón copia el ID de la tarjeta', async () => {
    const user = userEvent.setup();
    renderPanel([CARD()]);
    await openWithEnter(user);

    await user.click(screen.getByRole('button', { name: 'Copiar T-1' }));

    expect(await navigator.clipboard.readText()).toBe('T-1');
    expect(await screen.findByText('Copiado')).toBeInTheDocument();
  });

  it('RF-29: la rama sugerida se copia con su botón', async () => {
    const user = userEvent.setup();
    renderPanel([CARD()]);
    await openWithEnter(user);

    await user.click(screen.getByRole('button', { name: 'Copiar nombre de rama' }));

    expect(await navigator.clipboard.readText()).toBe('feat/T-1-migrar-facturas');
  });

  it('RF-25: editar la fecha límite se refleja en el kanban sin recargar', async () => {
    const user = userEvent.setup();
    const api = renderPanel([CARD()]);
    const dialog = await openWithEnter(user);
    const board = document.querySelector('[data-card-ref="T-1"]') as HTMLElement;
    expect(board).not.toHaveTextContent('ene');

    fireEvent.change(within(dialog).getByLabelText('Fecha límite'), {
      target: { value: '2099-01-15' },
    });

    await waitFor(() =>
      expect(api.patches).toEqual([{ ref: 'T-1', body: { dueDate: '2099-01-15' } }]),
    );
    expect(tile('T-1')).toHaveTextContent('15 ene');
  });

  it('RF-21: un cambio rechazado por la API se revierte y se avisa', async () => {
    const user = userEvent.setup();
    const api = renderPanel([CARD()]);
    api.patchError = { status: 400, message: 'dueDate no puede ser anterior a startDate' };
    const dialog = await openWithEnter(user);

    fireEvent.change(within(dialog).getByLabelText('Fecha límite'), {
      target: { value: '2099-01-15' },
    });

    expect(await screen.findByText(/dueDate no puede ser anterior/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Fecha límite')).toHaveValue('');
    expect(tile('T-1')).not.toHaveTextContent('15 ene');
  });

  it('RF-21: cambiar la prioridad la guarda', async () => {
    const user = userEvent.setup();
    const api = renderPanel([CARD()]);
    const dialog = await openWithEnter(user);

    await user.selectOptions(within(dialog).getByLabelText('Prioridad'), 'urgent');

    await waitFor(() =>
      expect(api.patches).toEqual([{ ref: 'T-1', body: { priority: 'urgent' } }]),
    );
  });

  it('RF-21: las etiquetas se eligen en el multi-select y el kanban las muestra', async () => {
    const user = userEvent.setup();
    const api = renderPanel([CARD()]);
    const dialog = await openWithEnter(user);

    await user.click(within(dialog).getByRole('button', { name: /Editar etiquetas/ }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'feature' }));

    await waitFor(() =>
      expect(api.patches).toEqual([{ ref: 'T-1', body: { labels: ['feature'] } }]),
    );
    expect(await within(tile('T-1') as HTMLElement).findByText('feature')).toBeInTheDocument();
  });

  it('§6.2: e edita el título en línea, Enter lo guarda y el kanban lo refleja', async () => {
    const user = userEvent.setup();
    const api = renderPanel([CARD()]);
    await openWithEnter(user);

    await user.keyboard('e');
    const input = screen.getByRole('textbox', { name: 'Título de la tarjeta' });
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, 'Migrar boletas{Enter}');

    await waitFor(() =>
      expect(api.patches).toEqual([{ ref: 'T-1', body: { title: 'Migrar boletas' } }]),
    );
    expect(await screen.findByRole('dialog', { name: 'Migrar boletas' })).toBeInTheDocument();
    expect(tile('T-1')).toHaveTextContent('Migrar boletas');
  });

  it('§6.2: Esc dentro del título cancela la edición y no cierra el panel', async () => {
    const user = userEvent.setup();
    const api = renderPanel([CARD()]);
    await openWithEnter(user);

    await user.keyboard('e');
    await user.type(screen.getByRole('textbox', { name: 'Título de la tarjeta' }), 'x{Escape}');

    expect(screen.getByRole('dialog', { name: 'Migrar facturas' })).toBeInTheDocument();
    expect(api.patches).toEqual([]);
  });

  it('RF-27: archivar desde el menú ⋯ la saca del kanban y deja la opción de desarchivar', async () => {
    const user = userEvent.setup();
    const api = renderPanel([CARD(), makeCard('todo', { number: 2, title: 'Otra' })]);
    const dialog = await openWithEnter(user);

    await user.click(within(dialog).getByRole('button', { name: 'Más acciones' }));
    await user.click(screen.getByRole('menuitem', { name: 'Archivar tarjeta' }));

    await waitFor(() => expect(api.archives).toEqual([{ ref: 'T-1', archive: true }]));
    await waitFor(() => expect(tile('T-1')).toBeNull());
    expect(within(dialog).getByText('Archivada')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Más acciones' }));
    expect(screen.getByRole('menuitem', { name: 'Desarchivar tarjeta' })).toBeInTheDocument();
  });

  it('§4.2: Esc en el menú ⋯ lo cierra sin cerrar el panel', async () => {
    const user = userEvent.setup();
    renderPanel([CARD()]);
    const dialog = await openWithEnter(user);

    await user.click(within(dialog).getByRole('button', { name: 'Más acciones' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Migrar facturas' })).toBeInTheDocument();
  });

  it('RF-28: mover a otro proyecto la saca del tablero actual y sigue la URL del destino', async () => {
    const user = userEvent.setup();
    const api = renderPanel([CARD()], { otherProjects: ['portafolio'] });
    const dialog = await openWithEnter(user);

    await user.click(within(dialog).getByRole('button', { name: 'Más acciones' }));
    await user.click(screen.getByRole('menuitem', { name: 'Mover a otro proyecto…' }));
    const move = await screen.findByRole('dialog', { name: 'Mover T-1 a otro proyecto' });
    await user.selectOptions(within(move).getByLabelText('Proyecto de destino'), 'portafolio');
    await user.click(within(move).getByRole('button', { name: 'Mover' }));

    await waitFor(() =>
      expect(api.patches).toEqual([{ ref: 'T-1', body: { project: 'portafolio' } }]),
    );
    await waitFor(() => expect(location()).toHaveTextContent('/p/portafolio/T-1'));
  });

  it('una tarjeta que no existe dice que no existe, con salida', async () => {
    const user = userEvent.setup();
    renderPanel([CARD()], { path: '/p/siga/T-99' });

    expect(await screen.findByText('La tarjeta T-99 no existe.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(location()).toHaveTextContent(/^\/p\/siga$/);
  });
});

describe('panel en modo creación (Plan 4.4)', () => {
  it('n abre el panel de creación, que crea la tarjeta en Por hacer y pasa a su detalle', async () => {
    const user = userEvent.setup();
    const api = renderPanel([CARD()]);
    await screen.findByText('Migrar facturas');

    await user.click(document.body);
    await user.keyboard('n');
    const dialog = await screen.findByRole('dialog', { name: 'Nueva tarjeta' });
    expect(within(dialog).getByRole('textbox', { name: 'Título' })).toHaveFocus();
    await user.type(within(dialog).getByRole('textbox', { name: 'Título' }), 'Escribir informe');
    await user.click(within(dialog).getByRole('button', { name: 'Crear tarjeta' }));

    await waitFor(() => expect(api.created).toHaveLength(1));
    expect(api.created[0]).toMatchObject({ title: 'Escribir informe', status: 'todo' });
    expect(await screen.findByRole('dialog', { name: 'Escribir informe' })).toBeInTheDocument();
    expect(location()).toHaveTextContent(/^\/p\/siga\/T-\d+$/);
  });

  it('el botón "Nueva tarjeta" de la barra también abre el panel; sin título no crea', async () => {
    const user = userEvent.setup();
    const api = renderPanel([CARD()]);
    await screen.findByText('Migrar facturas');

    await user.click(screen.getByRole('button', { name: 'Nueva tarjeta' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva tarjeta' });
    await user.click(within(dialog).getByRole('button', { name: 'Crear tarjeta' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('El título es obligatorio.');
    expect(api.created).toEqual([]);
  });

  it('Esc cierra el panel de creación y devuelve el foco al botón que lo abrió', async () => {
    const user = userEvent.setup();
    renderPanel([CARD()]);
    await screen.findByText('Migrar facturas');
    const button = screen.getByRole('button', { name: 'Nueva tarjeta' });

    await user.click(button);
    await screen.findByRole('dialog', { name: 'Nueva tarjeta' });
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(button).toHaveFocus();
  });
});
