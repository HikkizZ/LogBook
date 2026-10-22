import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DndContextProps, DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import { makeCard, renderBoard } from '../test/board-fixtures';

// jsdom no calcula geometría, así que el arrastre real (puntero/teclado) no se puede simular. Se captura
// el `DndContext` que monta el tablero y se invoca su `onDragEnd` con el evento que dnd-kit emitiría:
// así se prueba todo lo nuestro (destino, optimismo, reversión, diálogo) con la API falsa de msw.
const captured = vi.hoisted(() => ({ props: null as unknown as DndContextProps }));

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    DndContext: (props: DndContextProps) => {
      captured.props = props;
      return <actual.DndContext {...props} />;
    },
  };
});

function dropEvent(
  activeId: string,
  overId: string,
  below = false,
  activatorEvent: Event = new Event('pointerdown'),
): DragEndEvent {
  return {
    active: {
      id: activeId,
      rect: { current: { translated: { top: below ? 100 : 0, height: 10 }, initial: null } },
    },
    over: { id: overId, rect: { top: 0, height: 20 } },
    collisions: null,
    delta: { x: 0, y: 0 },
    activatorEvent,
  } as unknown as DragEndEvent;
}

function drop(activeId: string, overId: string, below = false) {
  act(() => captured.props.onDragEnd?.(dropEvent(activeId, overId, below)));
}

/** Arrastre con teclado: dnd-kit avisa del inicio con el `keydown` que lo activó y luego suelta. */
function keyboardDrop(activeId: string, overId: string, below = false) {
  const activatorEvent = new KeyboardEvent('keydown');
  act(() =>
    captured.props.onDragStart?.({
      active: { id: activeId },
      activatorEvent,
    } as unknown as DragStartEvent),
  );
  act(() => captured.props.onDragEnd?.(dropEvent(activeId, overId, below, activatorEvent)));
}

const region = (name: string) => screen.getByRole('region', { name });

describe('soltar una tarjeta (4.3, RF-11, RF-14)', () => {
  it('RF-11: soltar sobre otra columna la mueve al instante y pide a la API el estado destino', async () => {
    const api = renderBoard([makeCard('todo', { number: 1, title: 'Arrastrada' })]);
    await screen.findByText('Arrastrada');

    drop('id-1', 'col:review');

    expect(await within(region('Revisión')).findByText('Arrastrada')).toBeInTheDocument();
    await waitFor(() => expect(api.moves).toEqual([{ ref: 'T-1', body: { status: 'review' } }]));
  });

  it('RF-11: soltar sobre una tarjeta de otra columna la inserta en su posición', async () => {
    const api = renderBoard([
      makeCard('todo', { number: 1, title: 'Arrastrada' }),
      makeCard('review', { number: 2, title: 'R1' }),
      makeCard('review', { number: 3, title: 'R2' }),
    ]);
    await screen.findByText('Arrastrada');

    drop('id-1', 'id-3');

    await waitFor(() => expect(api.moves).toHaveLength(1));
    expect(api.moves[0]?.body).toEqual({ status: 'review', position: 1 });
    expect(
      within(region('Revisión'))
        .getAllByText(/^(Arrastrada|R1|R2)$/)
        .map((e) => e.textContent),
    ).toEqual(['R1', 'Arrastrada', 'R2']);
  });

  it('RF-11: reordenar dentro de la columna manda el índice final', async () => {
    const api = renderBoard([
      makeCard('todo', { number: 1, title: 'A' }),
      makeCard('todo', { number: 2, title: 'B' }),
      makeCard('todo', { number: 3, title: 'C' }),
    ]);
    await screen.findByText('A');

    drop('id-1', 'id-3');

    await waitFor(() =>
      expect(api.moves).toEqual([{ ref: 'T-1', body: { status: 'todo', position: 2 } }]),
    );
  });

  it('con un filtro activo el índice sale de la columna completa, no de la visible', async () => {
    const bug = [{ name: 'bug', color: 'magenta' }];
    const api = renderBoard(
      [
        makeCard('todo', { number: 1, title: 'V1', labels: bug }),
        makeCard('todo', { number: 2, title: 'Oculta' }),
        makeCard('todo', { number: 3, title: 'V2', labels: bug }),
      ],
      '/p/siga?label=bug',
    );
    await screen.findByText('V1');
    expect(screen.queryByText('Oculta')).not.toBeInTheDocument();

    drop('id-1', 'id-3');

    await waitFor(() =>
      expect(api.moves).toEqual([{ ref: 'T-1', body: { status: 'todo', position: 2 } }]),
    );
  });

  it('soltar en el mismo sitio, o fuera de las columnas, no llama a la API', async () => {
    const api = renderBoard([makeCard('todo', { number: 1, title: 'A' })]);
    await screen.findByText('A');

    drop('id-1', 'id-1');
    drop('id-1', 'col:todo');
    act(() =>
      captured.props.onDragEnd?.({ ...dropEvent('id-1', 'x'), over: null } as DragEndEvent),
    );

    expect(api.moves).toHaveLength(0);
  });

  it('RF-11: si la API falla, la tarjeta vuelve a su columna y se avisa', async () => {
    let release: (status: number) => void = () => undefined;
    const api = renderBoard([makeCard('todo', { number: 1, title: 'Arrastrada' })]);
    api.moveGate = () => new Promise<number>((resolve) => (release = resolve));
    await screen.findByText('Arrastrada');

    drop('id-1', 'col:in_progress');
    expect(await within(region('En curso')).findByText('Arrastrada')).toBeInTheDocument();
    release(500);

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo mover T-1');
    await waitFor(() =>
      expect(within(region('Por hacer')).getByText('Arrastrada')).toBeInTheDocument(),
    );
    expect(within(region('En curso')).queryByText('Arrastrada')).not.toBeInTheDocument();
  });

  it('RF-14: soltar en Bloqueado abre el diálogo sin mover; cancelar no cambia nada', async () => {
    const user = userEvent.setup();
    const api = renderBoard([makeCard('todo', { number: 1, title: 'Arrastrada' })]);
    await screen.findByText('Arrastrada');

    drop('id-1', 'col:blocked');

    const dialog = await screen.findByRole('dialog', { name: '¿Por qué queda bloqueada T-1?' });
    expect(within(region('Por hacer')).getByText('Arrastrada')).toBeInTheDocument();
    expect(api.moves).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(region('Por hacer')).getByText('Arrastrada')).toBeInTheDocument();
    expect(api.moves).toHaveLength(0);
  });

  it('RF-14: soltar en Bloqueado y confirmar el motivo mueve con `reason` y la posición del soltado', async () => {
    const user = userEvent.setup();
    const api = renderBoard([
      makeCard('todo', { number: 1, title: 'Arrastrada' }),
      makeCard('blocked', { number: 2, title: 'Ya bloqueada' }),
    ]);
    await screen.findByText('Arrastrada');

    drop('id-1', 'id-2');
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), 'Espero respuesta');
    await user.click(within(dialog).getByRole('button', { name: 'Bloquear' }));

    await waitFor(() => expect(api.moves).toHaveLength(1));
    expect(api.moves[0]).toEqual({
      ref: 'T-1',
      body: { status: 'blocked', position: 0, reason: 'Espero respuesta' },
    });
  });

  it('RF-14: reordenar dentro de Bloqueado no pide motivo', async () => {
    const api = renderBoard([
      makeCard('blocked', { number: 1, title: 'B1' }),
      makeCard('blocked', { number: 2, title: 'B2' }),
    ]);
    await screen.findByText('B1');

    drop('id-1', 'id-2');

    await waitFor(() => expect(api.moves).toHaveLength(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.moves[0]?.body).toEqual({ status: 'blocked', position: 1 });
  });

  it('§6.1: los anuncios dicen origen y destino en español', async () => {
    renderBoard([
      makeCard('todo', { number: 1, title: 'A' }),
      makeCard('review', { number: 2, title: 'R' }),
    ]);
    await screen.findByText('A');
    const { announcements } = captured.props.accessibility ?? {};
    const active = { id: 'id-1', rect: { current: { translated: null } } };
    const event = (overId: string) =>
      ({ active, over: { id: overId, rect: { top: 0, height: 20 } } }) as unknown as Parameters<
        NonNullable<typeof announcements>['onDragEnd']
      >[0];

    expect(announcements?.onDragStart({ active } as never)).toBe('T-1 tomada.');
    expect(announcements?.onDragOver(event('id-2'))).toBe('T-1 sobre Revisión, posición 1.');
    expect(announcements?.onDragEnd(event('col:done'))).toBe('T-1 soltada en la columna Hecho.');
  });

  it('M-9 §6.1: al tomar la tarjeta no se anuncia "sobre" ella misma', async () => {
    renderBoard([makeCard('todo', { number: 1, title: 'A' })]);
    await screen.findByText('A');
    const { announcements } = captured.props.accessibility ?? {};

    const self = { active: { id: 'id-1' }, over: { id: 'id-1' } } as never;

    expect(announcements?.onDragOver(self)).toBeUndefined();
  });

  it('I-2 D-6: con teclado "sobre X" deja la tarjeta antes de X aunque su centro quede más abajo', async () => {
    const api = renderBoard([
      makeCard('todo', { number: 1, title: 'Arrastrada' }),
      makeCard('review', { number: 2, title: 'R1' }),
      makeCard('review', { number: 3, title: 'R2' }),
    ]);
    await screen.findByText('Arrastrada');

    keyboardDrop('id-1', 'id-3', true);

    await waitFor(() => expect(api.moves).toHaveLength(1));
    expect(api.moves[0]?.body).toEqual({ status: 'review', position: 1 });
  });

  it('I-2 D-6: con ratón soltar en la mitad inferior de X sigue dejando la tarjeta después de X', async () => {
    const api = renderBoard([
      makeCard('todo', { number: 1, title: 'Arrastrada' }),
      makeCard('review', { number: 2, title: 'R1' }),
      makeCard('review', { number: 3, title: 'R2' }),
    ]);
    await screen.findByText('Arrastrada');

    drop('id-1', 'id-3', true);

    await waitFor(() => expect(api.moves).toHaveLength(1));
    expect(api.moves[0]?.body).toEqual({ status: 'review', position: 2 });
  });

  it('I-2 D-6: el anuncio al soltar dice la posición real resultante, no la de la tarjeta de debajo', async () => {
    renderBoard([
      makeCard('todo', { number: 1, title: 'A' }),
      makeCard('review', { number: 2, title: 'R1' }),
      makeCard('review', { number: 3, title: 'R2' }),
    ]);
    await screen.findByText('A');
    const announce = (kind: 'keyboard' | 'pointer') => {
      const activatorEvent =
        kind === 'keyboard' ? new KeyboardEvent('keydown') : new Event('pointerdown');
      act(() =>
        captured.props.onDragStart?.({
          active: { id: 'id-1' },
          activatorEvent,
        } as unknown as DragStartEvent),
      );
      return captured.props.accessibility?.announcements?.onDragEnd({
        active: { id: 'id-1', rect: { current: { translated: { top: 100, height: 10 } } } },
        over: { id: 'id-3', rect: { top: 0, height: 20 } },
      } as never);
    };

    expect(announce('keyboard')).toBe('T-1 soltada en Revisión, posición 2.');
    expect(announce('pointer')).toBe('T-1 soltada en Revisión, posición 3.');
  });

  it('M-1 D-4: la columna destino lleva contorno discontinuo border-strong y no el relleno primary-soft', async () => {
    renderBoard([makeCard('todo', { number: 1, title: 'A' })]);
    await screen.findByText('A');

    act(() =>
      captured.props.onDragStart?.({
        active: { id: 'id-1' },
        activatorEvent: new Event('pointerdown'),
      } as unknown as DragStartEvent),
    );
    act(() =>
      captured.props.onDragOver?.({ over: { id: 'col:review' } } as unknown as DragOverEvent),
    );

    expect(region('Revisión')).toHaveClass('outline-2', 'outline-dashed', 'outline-border-strong');
    expect(region('Revisión')).not.toHaveClass('bg-primary-soft');
    expect(region('Por hacer')).not.toHaveClass('outline-dashed');
  });
});
