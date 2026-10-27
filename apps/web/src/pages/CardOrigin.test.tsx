import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { makeCard, url } from '../test/board-fixtures';
import { renderPanel } from '../test/card-fixtures';
import { logCard, logEntry, logProject } from '../test/log-fixtures';
import { server } from '../test/server';
import type { LogView } from '../api/log-queries';

const SIGA = logProject('siga', 'SIGA');
const VIEW: LogView = {
  days: [
    {
      date: '2026-10-20',
      projects: [
        {
          project: SIGA,
          cards: [
            {
              card: logCard(1, 'siga', 'Migrar facturas'),
              entries: [logEntry('T-1', 'Avancé la exportación', '2026-10-20T14:00:00.000Z')],
            },
          ],
        },
      ],
    },
  ],
  moved: [],
};

function fakeLog() {
  server.use(http.get(url('/log'), () => HttpResponse.json(VIEW)));
}

const location = () => screen.getByTestId('location');

describe('volver al origen al cerrar el panel (D-1, I-1)', () => {
  it('D-1 §4.4: abrir una tarjeta desde Mi día y cerrar con Esc vuelve a Mi día con su fecha y el foco en el enlace', async () => {
    const user = userEvent.setup();
    renderPanel([makeCard('todo', { number: 1, title: 'Migrar facturas' })], {
      path: '/today?date=2026-10-20',
    });
    fakeLog();

    await user.click(await screen.findByRole('link', { name: /T-1 Migrar facturas/ }));
    await screen.findByRole('dialog', { name: 'Migrar facturas' });
    expect(location()).toHaveTextContent('/p/siga/T-1');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(location()).toHaveTextContent(/^\/today\?date=2026-10-20$/));
    const link = await screen.findByRole('link', { name: /T-1 Migrar facturas/ });
    await waitFor(() => expect(link).toHaveFocus());
  });

  it('D-1 §4.4: el clic fuera del panel también vuelve a Mi semana', async () => {
    const user = userEvent.setup();
    renderPanel([makeCard('todo', { number: 1, title: 'Migrar facturas' })], {
      path: '/week?date=2026-10-20&project=siga',
    });
    fakeLog();

    await user.click(await screen.findByRole('link', { name: /T-1 Migrar facturas/ }));
    await screen.findByRole('dialog', { name: 'Migrar facturas' });

    // El velo transparente que cierra el panel es el hermano anterior del diálogo.
    const backdrop = screen.getByRole('dialog').previousElementSibling;
    if (!backdrop) throw new Error('sin velo');
    await user.pointer({ keys: '[MouseLeft]', target: backdrop });

    await waitFor(() =>
      expect(location()).toHaveTextContent(/^\/week\?date=2026-10-20&project=siga$/),
    );
  });

  it('D-1 §4.6: abrir una tarjeta desde la paleta y cerrar el panel vuelve a la vista donde estaba', async () => {
    const user = userEvent.setup();
    const card = makeCard('todo', { number: 2, title: 'Otra tarjeta' });
    renderPanel([card], { path: '/today?date=2026-10-20' });
    fakeLog();
    server.use(
      http.get(url('/search'), () =>
        HttpResponse.json({ cards: [{ card, snippet: 'Otra <mark>tarjeta</mark>' }], entries: [] }),
      ),
    );
    await screen.findByRole('link', { name: /T-1 Migrar facturas/ });
    await user.keyboard('/');
    const dialog = await screen.findByRole('dialog', { name: 'Buscar' });
    await user.keyboard('otra');
    await within(dialog).findByRole('option');
    await user.keyboard('{Enter}');
    await screen.findByRole('dialog', { name: 'Otra tarjeta' });
    expect(location()).toHaveTextContent('/p/siga/T-2');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(location()).toHaveTextContent(/^\/today\?date=2026-10-20$/));
    // La tarjeta no está en Mi día: el foco cae en el contenido principal.
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
  });

  it('D-1 §4.2: con la tarjeta abierta por URL directa (sin origen) se cierra al tablero', async () => {
    const user = userEvent.setup();
    renderPanel([makeCard('todo', { number: 1, title: 'Migrar facturas' })], {
      path: '/p/siga/T-1',
    });
    await screen.findByRole('dialog', { name: 'Migrar facturas' });

    await user.keyboard('{Escape}');

    await waitFor(() => expect(location()).toHaveTextContent(/^\/p\/siga$/));
  });
});
