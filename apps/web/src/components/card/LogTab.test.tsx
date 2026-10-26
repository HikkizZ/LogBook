import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeCard } from '../../test/board-fixtures';
import { makeEntry, renderPanel } from '../../test/card-fixtures';

beforeEach(() => localStorage.clear());

const tile = (ref: string) => document.querySelector<HTMLElement>(`[data-card-ref="${ref}"]`);

async function openLog(entries = [makeEntry('note', { body: 'Primera nota' })], extra = {}) {
  const user = userEvent.setup();
  const api = renderPanel([makeCard('todo', { number: 1, title: 'Migrar facturas' })], {
    log: entries,
    ...extra,
  });
  await screen.findByText('Migrar facturas');
  tile('T-1')?.focus();
  await user.keyboard('{Enter}');
  const dialog = await screen.findByRole('dialog', { name: 'Migrar facturas' });
  return { user, api, dialog };
}

describe('pestaña Bitácora (5.2)', () => {
  it('RF-30: es la pestaña por defecto y lista las entradas en orden cronológico, lo nuevo abajo', async () => {
    const { dialog } = await openLog([
      makeEntry('note', { body: 'Antigua', occurredAt: '2026-10-20T12:00:00.000Z' }),
      makeEntry('note', { body: 'Reciente', occurredAt: '2026-10-21T12:00:00.000Z' }),
    ]);

    expect(within(dialog).getByRole('tab', { name: 'Bitácora', selected: true })).toBeVisible();
    const items = await within(dialog).findAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Antigua'),
      expect.stringContaining('Reciente'),
    ]);
  });

  it('RF-31: escribir una nota y Ctrl+Enter la guarda y aparece abajo sin recargar', async () => {
    const { user, api, dialog } = await openLog();
    await within(dialog).findByText('Primera nota');

    const box = within(dialog).getByRole('textbox', { name: 'Nueva entrada de bitácora' });
    await user.type(box, 'Avancé la exportación{Control>}{Enter}{/Control}');

    await waitFor(() =>
      expect(api.logPosts).toEqual([{ ref: 'T-1', body: { body: 'Avancé la exportación' } }]),
    );
    const items = await within(dialog).findAllByRole('listitem');
    expect(items.at(-1)).toHaveTextContent('Avancé la exportación');
    expect(items.at(-1)).toHaveTextContent('hoy');
    expect(box).toHaveValue('');
  });

  it('RF-33: las entradas de sistema van atenuadas y "Solo mis notas" las oculta; la preferencia se recuerda', async () => {
    const entries = [
      makeEntry('note', { body: 'Nota mía' }),
      makeEntry('moved', {
        body: 'Por hacer → En curso',
        metadata: { from: 'todo', to: 'in_progress' },
      }),
    ];
    const { user, dialog } = await openLog(entries);
    const moved = await within(dialog).findByText('Por hacer → En curso');
    expect(moved.closest('p')).toHaveClass('text-fg-muted');

    await user.click(within(dialog).getByRole('checkbox', { name: 'Solo mis notas' }));

    expect(within(dialog).queryByText('Por hacer → En curso')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Nota mía')).toBeInTheDocument();
    expect(localStorage.getItem('logbook.logOnlyNotes')).toBe('1');
  });

  it('RF-33: la preferencia guardada se aplica al abrir', async () => {
    localStorage.setItem('logbook.logOnlyNotes', '1');
    const { dialog } = await openLog([
      makeEntry('note', { body: 'Nota mía' }),
      makeEntry('moved', { body: 'Por hacer → En curso' }),
    ]);

    await within(dialog).findByText('Nota mía');

    expect(within(dialog).getByRole('checkbox', { name: 'Solo mis notas' })).toBeChecked();
    expect(within(dialog).queryByText('Por hacer → En curso')).not.toBeInTheDocument();
  });

  it('§4.2: una entrada blocked lleva el punto rojo con el texto "Bloqueado"', async () => {
    const { dialog } = await openLog([makeEntry('blocked', { body: 'Espero respuesta' })]);

    expect(await within(dialog).findByText('Bloqueado')).toBeInTheDocument();
  });

  it('RF-30: "Otra fecha" registra la entrada con la fecha elegida (zona de Ajustes)', async () => {
    const { user, api, dialog } = await openLog();
    await within(dialog).findByText('Primera nota');

    await user.click(within(dialog).getByRole('button', { name: 'Otra fecha' }));
    fireEvent.change(within(dialog).getByLabelText('Fecha y hora de la entrada'), {
      target: { value: '2026-10-20T16:00' },
    });
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Nueva entrada de bitácora' }),
      'Reunión de ayer',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    // America/Santiago en octubre es UTC-3.
    await waitFor(() =>
      expect(api.logPosts).toEqual([
        { ref: 'T-1', body: { body: 'Reunión de ayer', occurredAt: '2026-10-20T19:00:00.000Z' } },
      ]),
    );
  });

  it('RF-32: editar una nota propia la guarda', async () => {
    const { user, api, dialog } = await openLog();
    await within(dialog).findByText('Primera nota');

    await user.click(within(dialog).getByRole('button', { name: /^Editar entrada de / }));
    const box = within(dialog).getByRole('textbox', { name: 'Editar entrada' });
    await user.clear(box);
    await user.type(box, 'Nota corregida{Control>}{Enter}{/Control}');

    await waitFor(() =>
      expect(api.logPatches).toEqual([{ id: api.log[0]?.id, body: { body: 'Nota corregida' } }]),
    );
    expect(await within(dialog).findByText('Nota corregida')).toBeInTheDocument();
  });

  it('RF-32: borrar pide confirmación; cancelar no borra y confirmar sí', async () => {
    const { user, api, dialog } = await openLog();
    await within(dialog).findByText('Primera nota');
    const id = api.log[0]?.id;

    await user.click(within(dialog).getByRole('button', { name: /^Borrar entrada de / }));
    const confirm = await screen.findByRole('dialog', { name: '¿Borrar esta entrada?' });
    await user.click(within(confirm).getByRole('button', { name: 'Cancelar' }));
    expect(api.logDeletes).toEqual([]);
    expect(within(dialog).getByText('Primera nota')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /^Borrar entrada de / }));
    await user.click(
      within(await screen.findByRole('dialog', { name: '¿Borrar esta entrada?' })).getByRole(
        'button',
        { name: 'Borrar' },
      ),
    );

    await waitFor(() => expect(api.logDeletes).toEqual([id]));
    await waitFor(() => expect(within(dialog).queryByText('Primera nota')).not.toBeInTheDocument());
  });

  it('M-3 §6.1: los botones de cada nota llevan su hora y la hora tiene la fecha absoluta al enfocarla', async () => {
    const { dialog } = await openLog([
      makeEntry('note', { body: 'Primera nota', occurredAt: new Date().toISOString() }),
    ]);
    await within(dialog).findByText('Primera nota');

    expect(
      within(dialog).getByRole('button', { name: /^Editar entrada de hoy \d{2}:\d{2}$/ }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: /^Borrar entrada de hoy \d{2}:\d{2}$/ }),
    ).toBeInTheDocument();

    const time = dialog.querySelector('time') as HTMLElement;
    time.focus();
    expect(time).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/\d{4}/);
  });

  it('M-4 §6.1: tras borrar una nota el foco pasa al cuadro de la bitácora, no al body', async () => {
    const { user, api, dialog } = await openLog();
    await within(dialog).findByText('Primera nota');

    await user.click(within(dialog).getByRole('button', { name: /^Borrar entrada de / }));
    await user.click(
      within(await screen.findByRole('dialog', { name: '¿Borrar esta entrada?' })).getByRole(
        'button',
        { name: 'Borrar' },
      ),
    );

    await waitFor(() => expect(api.logDeletes).toHaveLength(1));
    await waitFor(() => expect(within(dialog).queryByText('Primera nota')).not.toBeInTheDocument());
    expect(
      within(dialog).getByRole('textbox', { name: 'Nueva entrada de bitácora' }),
    ).toHaveFocus();
  });

  it('RF-32: las entradas de sistema no se editan ni se borran desde la UI', async () => {
    const { dialog } = await openLog([makeEntry('moved', { body: 'Por hacer → En curso' })]);
    await within(dialog).findByText('Por hacer → En curso');

    expect(
      within(dialog).queryByRole('button', { name: /Editar entrada|Borrar entrada/ }),
    ).toBeNull();
  });

  it('RS-12: el cuerpo de una nota se pinta sanitizado (sin scripts ni onclick)', async () => {
    const { dialog } = await openLog([
      makeEntry('note', {
        body: 'Hola <script>window.pwned = 1</script><b onclick="x()">negrita</b>',
      }),
    ]);

    await within(dialog).findByText(/Hola/);

    expect(dialog.querySelector('script')).toBeNull();
    expect(dialog.querySelector('[onclick]')).toBeNull();
  });

  it('RF-34: al pasar una tarjeta a Hecho se ofrece la entrada de cierre y queda en la bitácora', async () => {
    const user = userEvent.setup();
    const api = renderPanel([makeCard('review', { number: 1, title: 'Migrar facturas' })]);
    await screen.findByText('Migrar facturas');
    tile('T-1')?.focus();

    await user.keyboard('m');
    await user.click(await screen.findByRole('button', { name: 'Hecho' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Qué quedó en T-1?' });
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Entrada de cierre' }),
      'Quedó migrado y validado',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Guardar nota' }));

    await waitFor(() =>
      expect(api.logPosts).toEqual([{ ref: 'T-1', body: { body: 'Quedó migrado y validado' } }]),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('RF-34: la entrada de cierre es opcional ("Omitir" no escribe nada)', async () => {
    const user = userEvent.setup();
    const api = renderPanel([makeCard('review', { number: 1, title: 'Migrar facturas' })]);
    await screen.findByText('Migrar facturas');
    tile('T-1')?.focus();

    await user.keyboard('m');
    await user.click(await screen.findByRole('button', { name: 'Hecho' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Qué quedó en T-1?' });
    await user.click(within(dialog).getByRole('button', { name: 'Omitir' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.logPosts).toEqual([]);
    expect(api.moves).toEqual([{ ref: 'T-1', body: { status: 'done' } }]);
  });
});
