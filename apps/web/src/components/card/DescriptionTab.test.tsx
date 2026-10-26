import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeCard } from '../../test/board-fixtures';
import { renderPanel } from '../../test/card-fixtures';

beforeEach(() => localStorage.clear());

const tile = (ref: string) => document.querySelector<HTMLElement>(`[data-card-ref="${ref}"]`);

async function openDescription(description: string) {
  const user = userEvent.setup();
  const api = renderPanel([makeCard('todo', { number: 1, title: 'Migrar facturas', description })]);
  await screen.findByText('Migrar facturas');
  tile('T-1')?.focus();
  await user.keyboard('{Enter}');
  const dialog = await screen.findByRole('dialog', { name: 'Migrar facturas' });
  await user.click(await within(dialog).findByRole('tab', { name: 'Descripción' }));
  return { user, api, dialog };
}

describe('pestaña Descripción (5.3, RF-22, RS-12)', () => {
  it('RS-12: una descripción con <script> y onclick se renderiza sin ellos y los enlaces llevan rel="noopener noreferrer"', async () => {
    const hostile = [
      'Texto **importante**',
      '',
      '<script>window.pwned = 1</script>',
      '',
      '<p onclick="window.pwned = 2">clic aquí</p>',
      '',
      '<img src=x onerror="window.pwned = 3"> <iframe src="https://example.com"></iframe>',
      '',
      '[enlace](https://example.com/a) y [malo](javascript:window.pwned=4)',
      '',
      '<a href="https://example.com/b" onmouseover="window.pwned = 5">crudo</a>',
    ].join('\n');

    const { dialog } = await openDescription(hostile);

    const panel = await within(dialog).findByRole('tabpanel');
    await within(panel).findByText('importante');
    expect(panel.querySelector('script')).toBeNull();
    expect(panel.querySelector('iframe')).toBeNull();
    expect(panel.querySelector('img')).toBeNull();
    expect(panel.querySelector('[onclick], [onerror], [onmouseover]')).toBeNull();
    for (const el of panel.querySelectorAll('*')) {
      expect(el.getAttributeNames().filter((n) => n.startsWith('on'))).toEqual([]);
    }
    const link = within(panel).getByRole('link', { name: 'enlace' });
    expect(link).toHaveAttribute('href', 'https://example.com/a');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
    for (const a of panel.querySelectorAll('a')) {
      expect(a.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
      expect(a).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expect((window as unknown as { pwned?: number }).pwned).toBeUndefined();
  });

  it('RF-22: renderiza listas, código, negrita y encabezados (bajados de nivel bajo el h2 del panel)', async () => {
    const { dialog } = await openDescription('# Título\n\n- uno\n- dos\n\n`código` y **negrita**');

    const panel = await within(dialog).findByRole('tabpanel');
    expect(
      await within(panel).findByRole('heading', { level: 3, name: 'Título' }),
    ).toBeInTheDocument();
    expect(within(panel).getAllByRole('listitem')).toHaveLength(2);
    expect(panel.querySelector('code')).toHaveTextContent('código');
    expect(panel.querySelector('strong')).toHaveTextContent('negrita');
  });

  it('una descripción vacía lo dice', async () => {
    const { dialog } = await openDescription('');

    expect(await within(dialog).findByText('Sin descripción.')).toBeInTheDocument();
  });

  it('RF-21: "Editar" abre el textarea con vista previa; Guardar manda el markdown crudo', async () => {
    const { user, api, dialog } = await openDescription('Antes');
    await user.click(await within(dialog).findByRole('button', { name: 'Editar descripción' }));

    const box = within(dialog).getByRole('textbox', { name: /Descripción/ });
    await user.clear(box);
    await user.type(box, 'Ahora **fuerte**');
    expect(
      within(within(dialog).getByRole('region', { name: 'Vista previa' })).getByText('fuerte'),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(api.patches).toEqual([{ ref: 'T-1', body: { description: 'Ahora **fuerte**' } }]),
    );
    expect(
      await within(dialog).findByRole('button', { name: 'Editar descripción' }),
    ).toBeInTheDocument();
  });

  it('Esc en el editor cancela la edición sin cerrar el panel ni guardar', async () => {
    const { user, api, dialog } = await openDescription('Antes');
    await user.click(await within(dialog).findByRole('button', { name: 'Editar descripción' }));

    await user.type(within(dialog).getByRole('textbox', { name: /Descripción/ }), 'x{Escape}');

    expect(screen.getByRole('dialog', { name: 'Migrar facturas' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Editar descripción' })).toBeInTheDocument();
    expect(api.patches).toEqual([]);
  });
});
