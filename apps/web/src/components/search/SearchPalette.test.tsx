import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { CardDto, LogEntryDto, SearchResultDto } from 'shared';
import { makeCard, url } from '../../test/board-fixtures';
import { makeEntry, renderPanel } from '../../test/card-fixtures';
import { server } from '../../test/server';

const location = () => screen.getByTestId('location');

interface Hit {
  card: CardDto;
  snippet: string;
}

/** `GET /search` falso: devuelve `respond(q)` y registra cada `q` recibida. */
function fakeSearch(respond: (q: string) => SearchResultDto) {
  const queries: string[] = [];
  server.use(
    http.get(url('/search'), ({ request }) => {
      const q = new URL(request.url).searchParams.get('q') ?? '';
      queries.push(q);
      return HttpResponse.json(respond(q));
    }),
  );
  return queries;
}

/** Opciones de la paleta (el tablero tiene `<option>` nativos de sus selects). */
const palette = () => within(screen.getByRole('dialog', { name: 'Buscar' }));

const hits = (cards: Hit[]): SearchResultDto => ({ cards, entries: [] });

async function openPalette(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('heading', { name: 'SIGA' });
  await user.keyboard('/');
  return screen.findByRole('dialog', { name: 'Buscar' });
}

describe('paleta de búsqueda (6.3)', () => {
  it('§6.2: "/" abre la paleta con el foco en el campo; Esc la cierra y devuelve el foco', async () => {
    const user = userEvent.setup();
    renderPanel([makeCard('todo', { number: 1 })]);
    const button = await screen.findByRole('button', { name: 'Buscar' });
    button.focus();

    await user.keyboard('/');
    const dialog = await screen.findByRole('dialog', { name: 'Buscar' });
    const input = within(dialog).getByRole('combobox');
    expect(input).toHaveFocus();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(button).toHaveFocus();
  });

  it('§6.2: "/" no abre la paleta dentro de un campo, pero Ctrl+K sí', async () => {
    const user = userEvent.setup();
    renderPanel([makeCard('todo', { number: 1 })]);
    const field = await screen.findByPlaceholderText('Filtrar por texto…');
    await user.click(field);

    await user.keyboard('/');
    expect(screen.queryByRole('dialog', { name: 'Buscar' })).not.toBeInTheDocument();

    await user.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('dialog', { name: 'Buscar' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(field).toHaveFocus();
  });

  it('RF-52: con menos de 3 caracteres no se consulta', async () => {
    const user = userEvent.setup();
    renderPanel([makeCard('todo', { number: 1 })]);
    const queries = fakeSearch(() => hits([]));
    await openPalette(user);

    await user.keyboard('fa');
    await new Promise((r) => setTimeout(r, 400));

    expect(queries).toEqual([]);
    expect(
      screen.getByRole('dialog', { name: 'Buscar' }).querySelector('p[role="status"]'),
    ).toHaveTextContent('Escribe al menos 3 caracteres');
  });

  it('RF-51: el debounce de 200 ms junta varias teclas en una sola consulta', async () => {
    const user = userEvent.setup();
    renderPanel([makeCard('todo', { number: 1 })]);
    const queries = fakeSearch(() => hits([]));
    await openPalette(user);

    await user.keyboard('factura');
    expect(queries).toEqual([]);

    await waitFor(() => expect(queries).toEqual(['factura']));
    await expect(screen.findByText('Sin resultados.')).resolves.toBeInTheDocument();
  });

  it('RF-50: los resultados salen en grupos Tarjetas y Bitácora con el fragmento resaltado y el estado', async () => {
    const user = userEvent.setup();
    const card = makeCard('in_progress', { number: 7, title: 'Migrar facturas' });
    const archived = makeCard('done', {
      number: 8,
      title: 'Vieja',
      archivedAt: '2026-10-01T00:00:00.000Z',
    });
    renderPanel([card]);
    const entry: LogEntryDto = makeEntry('note', { cardRef: 'T-7', body: 'x' });
    fakeSearch(() => ({
      cards: [
        { card, snippet: 'Migrar <mark>facturas</mark>' },
        { card: archived, snippet: 'antigua <mark>factura</mark>' },
      ],
      entries: [{ entry, card, snippet: 'nota sobre <mark>factura</mark>' }],
    }));
    await openPalette(user);

    await user.keyboard('factura');

    const list = await screen.findByRole('listbox', { name: 'Resultados' });
    expect(await within(list).findByRole('group', { name: 'Tarjetas' })).toBeInTheDocument();
    expect(within(list).getByRole('group', { name: 'Bitácora' })).toBeInTheDocument();
    expect(within(list).getAllByRole('option')).toHaveLength(3);
    expect(list.querySelector('mark')).toHaveTextContent('facturas');
    expect(within(list).getByText('archivada')).toBeInTheDocument();
    expect(within(list).getAllByText('En curso').length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(
        screen.getByRole('dialog', { name: 'Buscar' }).querySelector('p[role="status"]'),
      ).toHaveTextContent('3 resultados.'),
    );
  });

  it('RF-51: ↑↓ mueve la opción activa (aria-activedescendant) y Enter abre /p/:slug/:ref', async () => {
    const user = userEvent.setup();
    const a = makeCard('todo', { number: 1, title: 'Primera' });
    const b = makeCard('todo', { number: 2, title: 'Segunda' });
    renderPanel([a, b]);
    fakeSearch(() =>
      hits([
        { card: a, snippet: 'Primera' },
        { card: b, snippet: 'Segunda' },
      ]),
    );
    await openPalette(user);
    const input = within(screen.getByRole('dialog', { name: 'Buscar' })).getByRole('combobox');

    await user.keyboard('prim');
    const options = await palette().findAllByRole('option');
    expect(input).toHaveAttribute('aria-activedescendant', options[0]?.id);

    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', options[1]?.id);
    expect(options[1]).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Enter}');

    await waitFor(() => expect(location()).toHaveTextContent('/p/siga/T-2'));
    expect(await screen.findByRole('dialog', { name: 'Segunda' })).toBeInTheDocument();
  });

  it('RF-51: buscar T-5 y Enter abre esa tarjeta (la coincidencia exacta va primera)', async () => {
    const user = userEvent.setup();
    const five = makeCard('todo', { number: 5, title: 'Cinco' });
    renderPanel([five]);
    const queries = fakeSearch(() => hits([{ card: five, snippet: 'Cinco' }]));
    await openPalette(user);

    await user.keyboard('T-5');
    await palette().findByRole('option');
    await user.keyboard('{Enter}');

    expect(queries).toEqual(['T-5']);
    await waitFor(() => expect(location()).toHaveTextContent('/p/siga/T-5'));
    expect(await screen.findByRole('dialog', { name: 'Cinco' })).toBeInTheDocument();
  });

  it('RF-50: el texto de una nota abre su tarjeta con la pestaña Bitácora', async () => {
    const user = userEvent.setup();
    const card = makeCard('todo', { number: 1, title: 'Migrar facturas' });
    renderPanel([card]);
    const entry = makeEntry('note', { cardRef: 'T-1', body: 'Hablé con contabilidad' });
    fakeSearch(() => ({
      cards: [],
      entries: [{ entry, card, snippet: 'Hablé con <mark>contabilidad</mark>' }],
    }));
    await openPalette(user);

    await user.keyboard('contabilidad');
    await palette().findByRole('option');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(location()).toHaveTextContent('/p/siga/T-1'));
    const panel = await screen.findByRole('dialog', { name: 'Migrar facturas' });
    expect(await within(panel).findByRole('tab', { name: 'Bitácora' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('RS-12: <script>, onerror y otras etiquetas del snippet no se ejecutan; solo queda <mark>', async () => {
    const user = userEvent.setup();
    const card = makeCard('todo', { number: 1, title: 'Tarjeta' });
    renderPanel([card]);
    const w = window as unknown as { pwned?: boolean };
    w.pwned = false;
    fakeSearch(() =>
      hits([
        {
          card,
          snippet:
            '<mark onclick="window.pwned=true">hola</mark><script>window.pwned=true</script>' +
            '<img src=x onerror="window.pwned=true"><b>negrita</b> &lt;i&gt;texto&lt;/i&gt;',
        },
      ]),
    );
    await openPalette(user);

    await user.keyboard('hola');
    const option = await palette().findByRole('option');
    await new Promise((r) => setTimeout(r, 100));

    expect(w.pwned).toBe(false);
    expect(option.querySelector('script, img, b, [onclick], [onerror]')).toBeNull();
    expect(option.querySelector('mark')).toHaveTextContent('hola');
    expect(option).toHaveTextContent('negrita');
    expect(option).toHaveTextContent('<i>texto</i>');
  });
});
