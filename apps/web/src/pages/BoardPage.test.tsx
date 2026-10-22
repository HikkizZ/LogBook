import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { CardDto } from 'shared';
import { server } from '../test/server';
import { daysAgo, makeCard, makeProject, renderBoard, url } from '../test/board-fixtures';

beforeEach(() => localStorage.clear());

const column = (name: string) => screen.findByRole('region', { name });
const cardEl = (ref: string) => document.querySelector<HTMLElement>(`[data-card-ref="${ref}"]`);

async function boardReady() {
  await screen.findByRole('heading', { level: 2, name: 'Backlog' });
}

/** Foco en una tarjeta como lo dejaría un Tab: sin pasar por el ratón. */
function focusCard(ref: string) {
  const el = cardEl(ref);
  if (!el) throw new Error(`No hay tarjeta ${ref}`);
  el.focus();
  return el;
}

describe('Board (4.2)', () => {
  it('RF-10: seis columnas fijas en orden, cada una con su h2', async () => {
    renderBoard([makeCard('todo')]);

    await boardReady();

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings.filter((h) => !['Proyectos'].includes(h ?? ''))).toEqual([
      'Backlog',
      'Por hacer',
      'En curso',
      'Revisión',
      'Bloqueado',
      'Hecho',
    ]);
  });

  it('pide las tarjetas del proyecto y las coloca en su columna, por position', async () => {
    renderBoard([
      makeCard('todo', { number: 1, title: 'Primera' }),
      makeCard('todo', { number: 2, title: 'Segunda' }),
      makeCard('review', { number: 3, title: 'En revisión' }),
    ]);

    const todo = await column('Por hacer');

    expect(
      within(todo)
        .getAllByText(/Primera|Segunda/)
        .map((e) => e.textContent),
    ).toEqual(['Primera', 'Segunda']);
    expect(within(await column('Revisión')).getByText('En revisión')).toBeInTheDocument();
  });

  it('sigue el cursor hasta traer todas las tarjetas (30 tarjetas con páginas de 200 no pierden ninguna)', async () => {
    const many = Array.from({ length: 30 }, (_, i) => makeCard('backlog', { number: 100 + i }));
    renderBoard(many);

    const backlog = await column('Backlog');

    expect(await within(backlog).findAllByText(/^Tarjeta \d+$/)).toHaveLength(30);
  });

  it('RF-13: En curso 4/3 se pinta en ámbar con un aviso para lectores; 2/3 no', async () => {
    renderBoard(Array.from({ length: 4 }, (_, i) => makeCard('in_progress', { number: 10 + i })));

    const col = await column('En curso');

    const counter = within(col).getByText('4/3');
    expect(counter.parentElement).toHaveClass('text-warning', 'bg-warning-soft');
    expect(within(col).getByText(/límite superado/)).toBeInTheDocument();
    expect(within(await column('Por hacer')).queryByText(/\d\/3/)).not.toBeInTheDocument();
  });

  it('RF-13: bajo el límite el contador no es ámbar', async () => {
    renderBoard([makeCard('in_progress'), makeCard('in_progress')]);

    const col = await column('En curso');

    expect(within(col).getByText('2/3').parentElement).not.toHaveClass('text-warning');
  });

  it('RF-17: Hecho muestra los últimos 14 días y "Ver todo (N)" trae el resto', async () => {
    renderBoard([
      makeCard('done', { number: 1, title: 'Reciente', completedAt: daysAgo(2) }),
      makeCard('done', { number: 2, title: 'Antigua', completedAt: daysAgo(40) }),
      makeCard('done', { number: 3, title: 'Antigua 2', completedAt: daysAgo(60) }),
    ]);
    const user = userEvent.setup();
    const done = await column('Hecho');
    expect(within(done).getByText('Reciente')).toBeInTheDocument();
    expect(within(done).queryByText('Antigua')).not.toBeInTheDocument();

    await user.click(within(done).getByRole('button', { name: 'Ver todo (3)' }));

    expect(within(done).getByText('Antigua')).toBeInTheDocument();
    expect(within(done).getByText('Antigua 2')).toBeInTheDocument();
    expect(
      within(done).getByRole('button', { name: 'Ver solo los últimos 14 días' }),
    ).toBeInTheDocument();
  });

  it('RF-17: sin tarjetas antiguas no hay enlace "Ver todo"', async () => {
    renderBoard([makeCard('done', { completedAt: daysAgo(1) })]);

    const done = await column('Hecho');

    expect(within(done).queryByRole('button', { name: /Ver todo/ })).not.toBeInTheDocument();
  });

  it('columnas vacías dicen "Nada aquí"', async () => {
    renderBoard([makeCard('todo')]);

    const backlog = await column('Backlog');

    expect(within(backlog).getByText('Nada aquí')).toBeInTheDocument();
  });

  it('§4.1: un proyecto sin tarjetas ofrece "Crea tu primera tarjeta" y el botón abre la tarjeta rápida', async () => {
    const user = userEvent.setup();
    renderBoard([]);
    expect(await screen.findByText('Crea tu primera tarjeta')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Nueva tarjeta' })[0] as HTMLElement);

    expect(
      await screen.findByRole('textbox', { name: 'Título de la nueva tarjeta en Por hacer' }),
    ).toHaveFocus();
  });

  it('un proyecto que no existe (404) lo dice, sin tablero', async () => {
    renderBoard([], '/p/siga', 3, 404);

    expect(await screen.findByText('Este proyecto no existe.')).toBeInTheDocument();
  });
});

describe('mover con "Mover a…" (4.3, RF-11, RF-12)', () => {
  const setup = (gate?: () => Promise<number>) => {
    const api = renderBoard([
      makeCard('todo', { number: 1, title: 'Mover esta' }),
      makeCard('todo', { number: 2, title: 'Otra' }),
    ]);
    api.moveGate = gate;
    return api;
  };

  async function openMoveMenu(user: ReturnType<typeof userEvent.setup>, ref: string) {
    await boardReady();
    await screen.findByText('Mover esta');
    focusCard(ref);
    await user.keyboard('m');
    return screen.findByRole('dialog', { name: `Mover ${ref} a…` });
  }

  it('RF-12: m abre el menú, elegir columna mueve la tarjeta y la API recibe el estado', async () => {
    const user = userEvent.setup();
    const api = setup();
    const menu = await openMoveMenu(user, 'T-1');
    expect(within(menu).getByRole('button', { name: /Por hacer/ })).toBeDisabled();

    await user.click(within(menu).getByRole('button', { name: 'En curso' }));

    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'En curso' })).getByText('Mover esta'),
      ).toBeInTheDocument(),
    );
    expect(api.moves).toEqual([{ ref: 'T-1', body: { status: 'in_progress' } }]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // El foco vuelve a la tarjeta, que ahora está en otra columna.
    await waitFor(() => expect(cardEl('T-1')).toHaveFocus());
  });

  it('RF-11: la tarjeta se mueve al instante (optimista), antes de que responda la API', async () => {
    const user = userEvent.setup();
    let release: (status: number) => void = () => undefined;
    setup(() => new Promise<number>((resolve) => (release = resolve)));
    const menu = await openMoveMenu(user, 'T-1');

    await user.click(within(menu).getByRole('button', { name: 'Revisión' }));

    expect(await within(await column('Revisión')).findByText('Mover esta')).toBeInTheDocument();
    release(200);
  });

  it('RF-11: si la API falla la tarjeta vuelve a su columna y avisa con un toast', async () => {
    const user = userEvent.setup();
    let release: (status: number) => void = () => undefined;
    setup(() => new Promise<number>((resolve) => (release = resolve)));
    const menu = await openMoveMenu(user, 'T-1');
    await user.click(within(menu).getByRole('button', { name: 'Revisión' }));
    expect(await within(await column('Revisión')).findByText('Mover esta')).toBeInTheDocument();

    release(500);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudo mover T-1: Falló el servidor');
    await waitFor(() => {
      expect(
        within(screen.getByRole('region', { name: 'Por hacer' })).getByText('Mover esta'),
      ).toBeInTheDocument();
    });
    expect(
      within(screen.getByRole('region', { name: 'Revisión' })).queryByText('Mover esta'),
    ).not.toBeInTheDocument();
  });

  it('un 409 de proyecto archivado también revierte y muestra el mensaje de la API', async () => {
    const user = userEvent.setup();
    const api = setup();
    api.moveGate = () => Promise.resolve(409);
    server.use(
      http.post(url('/cards/:ref/move'), () =>
        HttpResponse.json(
          { error: { code: 'CONFLICT', message: 'El proyecto está archivado' } },
          { status: 409 },
        ),
      ),
    );
    const menu = await openMoveMenu(user, 'T-1');

    await user.click(within(menu).getByRole('button', { name: 'En curso' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El proyecto está archivado');
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Por hacer' })).getByText('Mover esta'),
      ).toBeInTheDocument(),
    );
  });
});

describe('Bloqueado pide motivo (RF-14, §4.3)', () => {
  async function toBlockDialog(user: ReturnType<typeof userEvent.setup>) {
    const api = renderBoard([makeCard('in_progress', { number: 7, title: 'A bloquear' })]);
    await screen.findByText('A bloquear');
    focusCard('T-7');
    await user.keyboard('m');
    await user.click(await screen.findByRole('button', { name: 'Bloqueado' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Por qué queda bloqueada T-7?' });
    return { api, dialog };
  }

  it('RF-14: mover a Bloqueado abre el diálogo y, mientras no se confirma, no se pide nada a la API', async () => {
    const user = userEvent.setup();
    const { api, dialog } = await toBlockDialog(user);

    expect(within(dialog).getByRole('textbox', { name: 'Motivo del bloqueo' })).toHaveFocus();
    expect(api.moves).toHaveLength(0);
    expect(
      within(screen.getByRole('region', { name: 'En curso' })).getByText('A bloquear'),
    ).toBeInTheDocument();
  });

  it('RF-14: con menos de 3 caracteres avisa y no mueve', async () => {
    const user = userEvent.setup();
    const { api, dialog } = await toBlockDialog(user);
    await user.type(within(dialog).getByRole('textbox'), ' ab ');

    await user.click(within(dialog).getByRole('button', { name: 'Bloquear' }));

    expect(within(dialog).getByRole('alert')).toHaveTextContent('Escribe al menos 3 caracteres.');
    expect(api.moves).toHaveLength(0);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('RF-14: con un motivo válido mueve y manda el `reason` recortado', async () => {
    const user = userEvent.setup();
    const { api, dialog } = await toBlockDialog(user);
    await user.type(within(dialog).getByRole('textbox'), '  Espero al cliente  ');

    await user.click(within(dialog).getByRole('button', { name: 'Bloquear' }));

    await waitFor(() => expect(api.moves).toHaveLength(1));
    expect(api.moves[0]).toEqual({
      ref: 'T-7',
      body: { status: 'blocked', reason: 'Espero al cliente' },
    });
    expect(await within(await column('Bloqueado')).findByText('A bloquear')).toBeInTheDocument();
  });

  it('RF-14: Cancelar (y Esc) deja la tarjeta en su columna, sin llamar a la API', async () => {
    const user = userEvent.setup();
    const { api, dialog } = await toBlockDialog(user);
    await user.type(within(dialog).getByRole('textbox'), 'algo');

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.moves).toHaveLength(0);
    expect(
      within(screen.getByRole('region', { name: 'En curso' })).getByText('A bloquear'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Bloqueado' })).queryByText('A bloquear'),
    ).not.toBeInTheDocument();

    // Al reabrirlo el texto no sobrevive a la cancelación.
    focusCard('T-7');
    await user.keyboard('m');
    await user.click(await screen.findByRole('button', { name: 'Bloqueado' }));
    const again = await screen.findByRole('dialog', { name: /bloqueada T-7/ });
    expect(within(again).getByRole('textbox')).toHaveValue('');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.moves).toHaveLength(0);
  });

  it('RF-14: si la API rechaza el bloqueo, la tarjeta vuelve a su columna', async () => {
    const user = userEvent.setup();
    const { api, dialog } = await toBlockDialog(user);
    api.moveGate = () => Promise.resolve(500);
    await user.type(within(dialog).getByRole('textbox'), 'Sin permisos');

    await user.click(within(dialog).getByRole('button', { name: 'Bloquear' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo mover T-7');
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'En curso' })).getByText('A bloquear'),
      ).toBeInTheDocument(),
    );
  });
});

describe('tarjeta rápida (4.4, RF-26)', () => {
  it('RF-26: + abre un input en la columna; tres Enter seguidos crean tres tarjetas, en orden y en esa columna', async () => {
    const user = userEvent.setup();
    const api = renderBoard([makeCard('review', { number: 1, title: 'Ya estaba' })]);
    await boardReady();

    await user.click(await screen.findByRole('button', { name: 'Nueva tarjeta en Revisión' }));
    const input = screen.getByRole('textbox', { name: 'Título de la nueva tarjeta en Revisión' });
    expect(input).toHaveFocus();
    await user.type(input, 'Uno{Enter}');
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
    await user.type(input, 'Dos{Enter}Tres{Enter}');

    const review = await column('Revisión');
    await waitFor(() => expect(within(review).getByText('Tres')).toBeInTheDocument());
    expect(api.created).toEqual([
      { title: 'Uno', status: 'review' },
      { title: 'Dos', status: 'review' },
      { title: 'Tres', status: 'review' },
    ]);
    expect(
      within(review)
        .getAllByText(/^(Ya estaba|Uno|Dos|Tres)$/)
        .map((e) => e.textContent),
    ).toEqual(['Ya estaba', 'Uno', 'Dos', 'Tres']);
  });

  it('RF-26: Esc cancela sin crear nada; un título vacío no crea', async () => {
    const user = userEvent.setup();
    const api = renderBoard([makeCard('todo')]);
    await boardReady();
    await user.click(await screen.findByRole('button', { name: 'Nueva tarjeta en Backlog' }));
    const input = screen.getByRole('textbox', { name: /Título de la nueva tarjeta/ });

    await user.type(input, '   {Enter}');
    expect(api.created).toHaveLength(0);
    await user.type(input, 'Algo{Escape}');

    expect(
      screen.queryByRole('textbox', { name: /Título de la nueva tarjeta/ }),
    ).not.toBeInTheDocument();
    expect(api.created).toHaveLength(0);
  });

  it('RF-14: Bloqueado no ofrece tarjeta rápida (exigiría motivo)', async () => {
    renderBoard([makeCard('todo')]);

    await boardReady();

    expect(
      screen.queryByRole('button', { name: 'Nueva tarjeta en Bloqueado' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nueva tarjeta en En curso' })).toBeInTheDocument();
  });

  it('RF-26: n y el botón "Nueva tarjeta" de la barra abren la tarjeta rápida de Por hacer', async () => {
    const user = userEvent.setup();
    renderBoard([makeCard('backlog')]);
    await boardReady();
    const button = screen.getByRole('button', { name: 'Nueva tarjeta' });
    expect(button).toBeEnabled();

    await user.click(button);
    expect(
      await screen.findByRole('textbox', { name: 'Título de la nueva tarjeta en Por hacer' }),
    ).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox', { name: /Título de la nueva/ })).not.toBeInTheDocument();

    await user.click(document.body);
    await user.keyboard('n');
    expect(
      await screen.findByRole('textbox', { name: 'Título de la nueva tarjeta en Por hacer' }),
    ).toBeInTheDocument();
  });

  it('un error al crear avisa con "Reintentar" y no pierde el orden de las siguientes', async () => {
    const user = userEvent.setup();
    renderBoard([makeCard('todo')]);
    await boardReady();
    // M-5: "Reintentar" solo se ofrece ante un fallo de red.
    server.use(http.post(url('/cards'), () => HttpResponse.error()));
    await user.click(screen.getByRole('button', { name: 'Nueva tarjeta en Backlog' }));

    await user.type(screen.getByRole('textbox', { name: /Título de la nueva/ }), 'Fallida{Enter}');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'No se pudo crear "Fallida": No se pudo conectar con el servidor',
    );
    expect(within(alert).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

describe('filtros (4.5, RF-18)', () => {
  const cards = (): CardDto[] => [
    makeCard('todo', {
      number: 1,
      title: 'Arreglar login',
      labels: [{ name: 'bug', color: 'magenta' }],
      priority: 'high',
    }),
    makeCard('todo', {
      number: 2,
      title: 'Nueva pantalla',
      labels: [{ name: 'feature', color: 'violeta' }],
    }),
    makeCard('review', {
      number: 3,
      title: 'Otro bug',
      labels: [{ name: 'bug', color: 'magenta' }],
    }),
  ];

  it('RF-18: recargar con ?label=bug mantiene el filtro (selector y tablero)', async () => {
    renderBoard(cards(), '/p/siga?label=bug');

    const todo = await column('Por hacer');

    expect(within(todo).getByText('Arreglar login')).toBeInTheDocument();
    expect(within(todo).queryByText('Nueva pantalla')).not.toBeInTheDocument();
    expect(within(await column('Revisión')).getByText('Otro bug')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Filtrar por etiqueta' })).toHaveValue('bug');
  });

  it('RF-18: ?priority= y ?q= se aplican desde la URL y se combinan', async () => {
    renderBoard(cards(), '/p/siga?priority=high&q=login');

    const todo = await column('Por hacer');

    expect(within(todo).getByText('Arreglar login')).toBeInTheDocument();
    expect(within(todo).queryByText('Nueva pantalla')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Filtrar por texto' })).toHaveValue('login');
    expect(screen.getByRole('combobox', { name: 'Filtrar por prioridad' })).toHaveValue('high');
  });

  it('RF-18: elegir etiqueta, prioridad o escribir texto actualiza la URL; Limpiar la vacía', async () => {
    const user = userEvent.setup();
    renderBoard(cards());
    await boardReady();

    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Filtrar por etiqueta' }),
      'feature',
    );
    expect(screen.getByTestId('location')).toHaveTextContent('/p/siga?label=feature');
    expect(within(await column('Por hacer')).queryByText('Arreglar login')).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Filtrar por texto' }), 'pant');
    expect(screen.getByTestId('location')).toHaveTextContent('/p/siga?label=feature&q=pant');

    await user.click(screen.getByRole('button', { name: 'Limpiar' }));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/p\/siga$/);
    expect(within(await column('Por hacer')).getByText('Arreglar login')).toBeInTheDocument();
  });

  it('RF-13: los filtros ocultan tarjetas pero el contador y el WIP siguen contando todas', async () => {
    renderBoard(
      Array.from({ length: 4 }, (_, i) =>
        makeCard('in_progress', {
          number: 10 + i,
          labels: i === 0 ? [{ name: 'bug', color: 'magenta' }] : [],
        }),
      ),
      '/p/siga?label=bug',
    );

    const col = await column('En curso');

    expect(within(col).getByText('4/3')).toBeInTheDocument();
    expect(within(col).getAllByText(/^Tarjeta \d+$/)).toHaveLength(1);
  });
});

describe('atajos del tablero (4.5, §6.2)', () => {
  const grid = () => [
    makeCard('todo', { number: 1, title: 'A1' }),
    makeCard('todo', { number: 2, title: 'A2' }),
    makeCard('todo', { number: 3, title: 'A3' }),
    makeCard('review', { number: 4, title: 'B1' }),
    makeCard('done', { number: 5, title: 'C1', completedAt: daysAgo(1) }),
    makeCard('done', { number: 6, title: 'C2', completedAt: daysAgo(1) }),
  ];

  it('§6.2: j y k recorren la columna; h y l saltan de columna (sin pararse en las vacías)', async () => {
    const user = userEvent.setup();
    renderBoard(grid());
    await screen.findByText('A1');

    await user.keyboard('j');
    expect(cardEl('T-1')).toHaveFocus();
    await user.keyboard('j');
    expect(cardEl('T-2')).toHaveFocus();
    await user.keyboard('k');
    expect(cardEl('T-1')).toHaveFocus();
    await user.keyboard('l');
    expect(cardEl('T-4')).toHaveFocus();
    await user.keyboard('l');
    expect(cardEl('T-5')).toHaveFocus();
    await user.keyboard('l');
    expect(cardEl('T-5')).toHaveFocus();
    await user.keyboard('h');
    expect(cardEl('T-4')).toHaveFocus();
  });

  it('§6.2: j en la última y k en la primera no se salen de la columna', async () => {
    const user = userEvent.setup();
    renderBoard(grid());
    await screen.findByText('A1');
    focusCard('T-3');

    await user.keyboard('j');
    expect(cardEl('T-3')).toHaveFocus();
    focusCard('T-1');
    await user.keyboard('k');
    expect(cardEl('T-1')).toHaveFocus();
  });

  it('§6.2: los atajos de una letra no actúan dentro de un input (filtro ni tarjeta rápida)', async () => {
    const user = userEvent.setup();
    renderBoard(grid());
    await screen.findByText('A1');
    focusCard('T-1');

    const filter = screen.getByRole('textbox', { name: 'Filtrar por texto' });
    await user.click(filter);
    await user.keyboard('jklm');

    expect(filter).toHaveValue('jklm');
    expect(filter).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Nueva tarjeta en Backlog' }));
    const quick = screen.getByRole('textbox', { name: /Título de la nueva/ });
    await user.keyboard('n m j');
    expect(quick).toHaveValue('n m j');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('§6.2: m sin tarjeta enfocada no hace nada; con una abre "Mover a…" con su ID', async () => {
    const user = userEvent.setup();
    renderBoard(grid());
    await screen.findByText('A1');

    await user.keyboard('m');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    focusCard('T-4');
    await user.keyboard('m');
    expect(screen.getByRole('dialog', { name: 'Mover T-4 a…' })).toBeVisible();
  });

  it('§6.2: Enter en una tarjeta enfocada la abre (provisional: /p/:slug/:ref); Espacio no navega', async () => {
    const user = userEvent.setup();
    renderBoard(grid());
    await screen.findByText('A1');

    focusCard('T-2');
    await user.keyboard(' ');
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/p\/siga$/);
    await user.keyboard('{Escape}');
    await user.keyboard('{Enter}');

    expect(screen.getByTestId('location')).toHaveTextContent('/p/siga/T-2');
  });

  it('un clic en la tarjeta también la abre', async () => {
    const user = userEvent.setup();
    renderBoard(grid());

    await user.click(await screen.findByText('B1'));

    expect(screen.getByTestId('location')).toHaveTextContent('/p/siga/T-4');
  });
});

describe('anuncios aria-live (4.3, §6.1)', () => {
  it('RF-12: Espacio toma la tarjeta y lo anuncia en español; Esc cancela y lo anuncia', async () => {
    const user = userEvent.setup();
    renderBoard([
      makeCard('todo', { number: 1, title: 'A1' }),
      makeCard('todo', { number: 2, title: 'A2' }),
    ]);
    await screen.findByText('A1');
    focusCard('T-1');

    await user.keyboard(' ');
    await waitFor(() => {
      const live = document.querySelector('[aria-live]');
      // Tras "tomada" dnd-kit anuncia enseguida sobre qué está (aquí, sin geometría, la primera columna).
      expect(live).toHaveTextContent(/^T-1 (tomada|sobre)/);
    });
    expect(cardEl('T-1')).toHaveAttribute('aria-roledescription', 'tarjeta arrastrable');

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(document.querySelector('[aria-live]')).toHaveTextContent(
        'Movimiento cancelado. T-1 sigue en su sitio.',
      );
    });
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/p\/siga$/);
  });
});

describe('correcciones de la revisión de la fase 4', () => {
  it('I-3 §6.2: con una tarjeta tomada, j/k/h/l y m no actúan; Esc la cancela', async () => {
    const user = userEvent.setup();
    renderBoard([
      makeCard('todo', { number: 1, title: 'A1' }),
      makeCard('review', { number: 2, title: 'R1' }),
    ]);
    await screen.findByText('A1');
    focusCard('T-1');

    await user.keyboard(' ');
    await waitFor(() => expect(document.querySelector('[aria-live]')).toHaveTextContent(/T-1/));
    await user.keyboard('l');
    expect(cardEl('T-1')).toHaveFocus();
    await user.keyboard('m');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(document.querySelector('[aria-live]')).toHaveTextContent(
        'Movimiento cancelado. T-1 sigue en su sitio.',
      );
    });
  });

  it('M-2: si la API repite el nextCursor la carga termina en error y no se cuelga', async () => {
    renderBoard([makeCard('todo')]);
    server.use(
      http.get(url('/cards'), () =>
        HttpResponse.json({ items: [makeCard('todo')], nextCursor: 'x' }),
      ),
    );

    expect(await screen.findByText('No se pudieron cargar las tarjetas.')).toBeInTheDocument();
  });

  it('M-4: una tarjeta creada no desaparece si un refetch iniciado antes responde sin ella', async () => {
    const user = userEvent.setup();
    const api = renderBoard([makeCard('todo', { number: 1, title: 'A1' })]);
    await boardReady();
    await screen.findByText('A1');

    // El refetch que dispara el `move` se queda en vuelo con una foto sin la tarjeta nueva.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get(url('/cards'), async () => {
        const snapshot = [...api.cards];
        await gate;
        return HttpResponse.json({ items: snapshot, nextCursor: null });
      }),
    );
    focusCard('T-1');
    await user.keyboard('m');
    const menu = await screen.findByRole('dialog', { name: 'Mover T-1 a…' });
    await user.click(within(menu).getByRole('button', { name: 'Backlog' }));
    await waitFor(() => expect(api.moves).toHaveLength(1));

    await user.click(screen.getByRole('button', { name: 'Nueva tarjeta en Revisión' }));
    await user.type(screen.getByRole('textbox', { name: /Título de la nueva/ }), 'Nueva{Enter}');
    await waitFor(() => expect(api.created).toHaveLength(1));
    expect(await screen.findByText('Nueva')).toBeInTheDocument();
    release();

    await new Promise((r) => setTimeout(r, 100));
    expect(screen.getByText('Nueva')).toBeInTheDocument();
  });

  it('M-5: un 409 al crear no ofrece "Reintentar"; un fallo de red sí', async () => {
    const user = userEvent.setup();
    renderBoard([makeCard('todo')]);
    await boardReady();
    server.use(
      http.post(url('/cards'), () =>
        HttpResponse.json({ error: { code: 'CONFLICT', message: 'Archivado' } }, { status: 409 }),
      ),
    );
    await user.click(await screen.findByRole('button', { name: 'Nueva tarjeta en Backlog' }));
    await user.type(screen.getByRole('textbox', { name: /Título de la nueva/ }), 'Uno{Enter}');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudo crear "Uno"');
    expect(within(alert).queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();

    server.use(http.post(url('/cards'), () => HttpResponse.error()));
    await user.type(screen.getByRole('textbox', { name: /Título de la nueva/ }), 'Dos{Enter}');
    expect(
      await screen.findByRole('button', { name: 'Reintentar' }, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it('M-8: Limpiar devuelve el foco al campo de texto', async () => {
    const user = userEvent.setup();
    renderBoard([makeCard('todo')], '/p/siga?label=bug');
    await boardReady();

    await user.click(await screen.findByRole('button', { name: 'Limpiar' }));

    expect(screen.getByRole('textbox', { name: 'Filtrar por texto' })).toHaveFocus();
  });

  it('M-10: el textarea del motivo enlaza una pista con el mínimo y, tras el error, el mensaje', async () => {
    const user = userEvent.setup();
    renderBoard([makeCard('todo', { number: 1, title: 'A1' })]);
    await screen.findByText('A1');
    focusCard('T-1');
    await user.keyboard('m');
    const menu = await screen.findByRole('dialog', { name: 'Mover T-1 a…' });
    await user.click(within(menu).getByRole('button', { name: 'Bloqueado' }));

    const textarea = await screen.findByRole('textbox', { name: 'Motivo del bloqueo' });
    const hintId = textarea.getAttribute('aria-describedby');
    expect(hintId).toBeTruthy();
    expect(document.getElementById(hintId ?? '')).toHaveTextContent(/Mínimo 3 caracteres/);

    await user.click(screen.getByRole('button', { name: 'Bloquear' }));
    const errorId = textarea.getAttribute('aria-describedby');
    expect(document.getElementById(errorId ?? '')).toHaveTextContent(/Escribe al menos 3/);
  });

  it('M-11: el contador de En curso no se pinta hasta que llega /projects (sin parpadeo 4 -> 4/3)', async () => {
    renderBoard(Array.from({ length: 4 }, (_, i) => makeCard('in_progress', { number: 10 + i })));
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get(url('/projects'), async () => {
        await gate;
        return HttpResponse.json([makeProject('siga', 3)]);
      }),
    );

    await screen.findByRole('status', { name: 'Cargando tarjetas' });
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByRole('region', { name: 'En curso' })).not.toBeInTheDocument();
    release();

    const col = await column('En curso');
    expect(within(col).getByText('4/3')).toBeInTheDocument();
  });

  it('M-12: "Ver todo" apunta con aria-controls a la lista que expande', async () => {
    renderBoard([
      makeCard('done', { number: 1, title: 'Reciente', completedAt: daysAgo(2) }),
      makeCard('done', { number: 2, title: 'Antigua', completedAt: daysAgo(40) }),
    ]);
    const done = await column('Hecho');

    const button = within(done).getByRole('button', { name: 'Ver todo (2)' });

    const id = button.getAttribute('aria-controls');
    expect(id).toBeTruthy();
    expect(document.getElementById(id ?? '')).toContainElement(within(done).getByText('Reciente'));
  });
});
