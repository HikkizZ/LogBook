import type { KeyboardCoordinateGetter } from '@dnd-kit/core';
import { makeCard, withPositions } from '../test/board-fixtures';
import {
  applyMove,
  boardKeyboardCoordinates,
  groupByStatus,
  isNoop,
  isRecentlyDone,
  matchesFilters,
  parseFilters,
  resolveDrop,
} from './board';
import { dueInfo, todayIn } from './dates';

const col = (cards: ReturnType<typeof makeCard>[], status: string) =>
  groupByStatus(cards)[status as 'todo'].map((c) => c.ref);

describe('applyMove (RF-11, RF-14: espejo optimista de move)', () => {
  const base = withPositions([
    makeCard('todo', { number: 1 }),
    makeCard('todo', { number: 2 }),
    makeCard('todo', { number: 3 }),
    makeCard('in_progress', { number: 4 }),
  ]);

  it('RF-11: reordenar dentro de la columna deja el índice final pedido y renumera', () => {
    const next = applyMove(base, { ref: 'T-1', status: 'todo', position: 2 });

    expect(col(next, 'todo')).toEqual(['T-2', 'T-3', 'T-1']);
    expect(groupByStatus(next).todo.map((c) => c.position)).toEqual([0, 1, 2]);
  });

  it('RF-11: otra columna sin position va al final y compacta la de origen', () => {
    const next = applyMove(base, { ref: 'T-1', status: 'in_progress' });

    expect(col(next, 'in_progress')).toEqual(['T-4', 'T-1']);
    expect(col(next, 'todo')).toEqual(['T-2', 'T-3']);
    expect(groupByStatus(next).todo.map((c) => c.position)).toEqual([0, 1]);
  });

  it('RF-11: position mayor que el tamaño se acota al final; 0 va primero', () => {
    expect(col(applyMove(base, { ref: 'T-4', status: 'todo', position: 99 }), 'todo')).toEqual([
      'T-1',
      'T-2',
      'T-3',
      'T-4',
    ]);
    expect(col(applyMove(base, { ref: 'T-4', status: 'todo', position: 0 }), 'todo')).toEqual([
      'T-4',
      'T-1',
      'T-2',
      'T-3',
    ]);
  });

  it('RF-15: entrar a Hecho pone completedAt y salir de Hecho lo vacía', () => {
    const done = applyMove(base, { ref: 'T-1', status: 'done' }, '2026-10-22T12:00:00.000Z');
    expect(done.find((c) => c.ref === 'T-1')?.completedAt).toBe('2026-10-22T12:00:00.000Z');

    const back = applyMove(done, { ref: 'T-1', status: 'todo' });
    expect(back.find((c) => c.ref === 'T-1')?.completedAt).toBeNull();
  });

  it('no muta la lista original', () => {
    const copy = structuredClone(base);
    applyMove(base, { ref: 'T-1', status: 'done' });
    expect(base).toEqual(copy);
  });
});

describe('resolveDrop (RF-11: destino del soltado sobre la columna completa)', () => {
  // Columna Por hacer con 4 tarjetas; el filtro podría ocultar T-2 y T-3, pero el índice es el real.
  const cards = withPositions([
    makeCard('todo', { number: 1 }),
    makeCard('todo', { number: 2 }),
    makeCard('todo', { number: 3 }),
    makeCard('todo', { number: 4 }),
    makeCard('review', { number: 5 }),
    makeCard('review', { number: 6 }),
  ]);
  const id = (n: number) => `id-${n}`;

  it('misma columna: el índice final es el de la tarjeta sobre la que se suelta', () => {
    expect(resolveDrop(cards, id(1), id(4), true)).toEqual({ status: 'todo', position: 3 });
    expect(resolveDrop(cards, id(4), id(2), false)).toEqual({ status: 'todo', position: 1 });
  });

  it('otra columna: antes de la tarjeta, o después si cae en su mitad inferior', () => {
    expect(resolveDrop(cards, id(1), id(6), false)).toEqual({ status: 'review', position: 1 });
    expect(resolveDrop(cards, id(1), id(6), true)).toEqual({ status: 'review', position: 2 });
  });

  it('sobre una columna: al final de ella (sin position)', () => {
    expect(resolveDrop(cards, id(1), 'col:done', false)).toEqual({ status: 'done' });
  });

  it('sobre sí misma no hace nada', () => {
    expect(resolveDrop(cards, id(1), id(1), false)).toBeNull();
  });

  it('isNoop: soltar en su sitio no pide movimiento', () => {
    expect(isNoop(cards, id(2), { status: 'todo', position: 1 })).toBe(true);
    expect(isNoop(cards, id(4), { status: 'todo' })).toBe(true);
    expect(isNoop(cards, id(2), { status: 'todo' })).toBe(false);
    expect(isNoop(cards, id(2), { status: 'review', position: 1 })).toBe(false);
  });
});

describe('filtros (RF-18)', () => {
  const card = makeCard('todo', {
    title: 'Migración de facturas',
    priority: 'high',
    labels: [{ name: 'Bug', color: 'magenta' }],
  });
  const filters = (qs: string) => parseFilters(new URLSearchParams(qs));

  it('lee etiqueta, prioridad y texto de la URL; una prioridad inválida se ignora', () => {
    expect(filters('label=bug&priority=high&q=fact')).toEqual({
      label: 'bug',
      priority: 'high',
      q: 'fact',
    });
    expect(filters('priority=urgentísima').priority).toBe('');
  });

  it('la etiqueta no distingue mayúsculas; el texto ignora tildes y busca también el ID', () => {
    expect(matchesFilters(card, filters('label=bug'))).toBe(true);
    expect(matchesFilters(card, filters('label=feature'))).toBe(false);
    expect(matchesFilters(card, filters('q=migracion'))).toBe(true);
    expect(matchesFilters(card, filters(`q=${card.ref}`))).toBe(true);
    expect(matchesFilters(card, filters('priority=low'))).toBe(false);
  });

  it('los filtros se combinan con Y', () => {
    expect(matchesFilters(card, filters('label=bug&priority=high&q=factura'))).toBe(true);
    expect(matchesFilters(card, filters('label=bug&priority=low'))).toBe(false);
  });
});

describe('RF-17: ventana de Hecho', () => {
  const now = Date.parse('2026-10-22T12:00:00.000Z');

  it('cuenta lo completado dentro de los últimos N días; sin completedAt cuenta como reciente', () => {
    const recent = makeCard('done', { completedAt: '2026-10-10T12:00:00.000Z' });
    const old = makeCard('done', { completedAt: '2026-10-01T12:00:00.000Z' });
    const fresh = makeCard('done', { completedAt: null });

    expect(isRecentlyDone(recent, 14, now)).toBe(true);
    expect(isRecentlyDone(old, 14, now)).toBe(false);
    expect(isRecentlyDone(fresh, 14, now)).toBe(true);
  });
});

describe('fechas (§4.1, §6.1)', () => {
  it('urgencia: vencida, hoy, mañana, en 2 días y lejana, siempre con texto', () => {
    expect(dueInfo('2026-10-19', '2026-10-22', false)).toEqual({
      tone: 'overdue',
      text: 'vencida hace 3 días',
    });
    expect(dueInfo('2026-10-21', '2026-10-22', false).text).toBe('vencida ayer');
    expect(dueInfo('2026-10-22', '2026-10-22', false)).toEqual({ tone: 'soon', text: 'vence hoy' });
    expect(dueInfo('2026-10-23', '2026-10-22', false).text).toBe('vence mañana');
    expect(dueInfo('2026-10-24', '2026-10-22', false).text).toBe('vence en 2 días');
    expect(dueInfo('2026-10-25', '2026-10-22', false).tone).toBe('soon');
    expect(dueInfo('2026-10-26', '2026-10-22', false)).toEqual({ tone: 'normal', text: '26 oct' });
  });

  it('una tarjeta hecha no se pinta como vencida', () => {
    expect(dueInfo('2026-10-01', '2026-10-22', true).tone).toBe('done');
  });

  it('"hoy" sale de la zona horaria de Ajustes', () => {
    const instant = new Date('2026-10-22T01:30:00.000Z');
    expect(todayIn('UTC', instant)).toBe('2026-10-22');
    expect(todayIn('America/Santiago', instant)).toBe('2026-10-21');
  });
});

describe('arrastre por teclado: coordinateGetter del tablero (§6.2)', () => {
  type Context = Parameters<KeyboardCoordinateGetter>[1]['context'];
  interface Box {
    status: string;
    left: number;
    top: number;
    width: number;
    height: number;
  }

  // Cuatro columnas de 180 px separadas 14: Por hacer (3 tarjetas), En curso (2), Revisión (vacía) y
  // Bloqueado (1). Las alturas difieren a propósito: el destino de una flecha no puede depender de ellas.
  const boxes: Record<string, Box> = {
    t1: { status: 'todo', left: 0, top: 0, width: 180, height: 80 },
    t2: { status: 'todo', left: 0, top: 90, width: 180, height: 80 },
    t3: { status: 'todo', left: 0, top: 180, width: 180, height: 80 },
    p1: { status: 'in_progress', left: 194, top: 0, width: 180, height: 100 },
    p2: { status: 'in_progress', left: 194, top: 110, width: 180, height: 60 },
    'col:review': { status: 'review', left: 388, top: 0, width: 180, height: 400 },
    b1: { status: 'blocked', left: 582, top: 0, width: 180, height: 80 },
    'col:todo': { status: 'todo', left: 0, top: 0, width: 180, height: 400 },
    'col:in_progress': { status: 'in_progress', left: 194, top: 0, width: 180, height: 400 },
    'col:blocked': { status: 'blocked', left: 582, top: 0, width: 180, height: 400 },
  };
  const rectOf = (b: Box) => ({
    left: b.left,
    top: b.top,
    width: b.width,
    height: b.height,
    right: b.left + b.width,
    bottom: b.top + b.height,
  });

  function press(
    code: string,
    activeId: string,
    options: { overId?: string; shift?: { x?: number; y?: number } } = {},
  ) {
    const entries = Object.entries(boxes).map(([id, b]) => ({
      id,
      disabled: false,
      data: { current: { status: b.status } },
    }));
    const rects = new Map(Object.entries(boxes).map(([id, b]) => [id, rectOf(b)]));
    const own = boxes[activeId] as Box;
    const collisionRect = rectOf({
      ...own,
      left: own.left + (options.shift?.x ?? 0),
      top: own.top + (options.shift?.y ?? 0),
    });
    const overId = options.overId ?? activeId;
    const context = {
      active: { id: activeId },
      collisionRect,
      droppableRects: rects,
      droppableContainers: {
        getEnabled: () => entries,
        get: (id: string) => entries.find((e) => e.id === id),
      },
      over: { id: overId },
    } as unknown as Context;
    const preventDefault = vi.fn();
    const result = boardKeyboardCoordinates({ code, preventDefault } as unknown as KeyboardEvent, {
      active: activeId,
      currentCoordinates: { x: collisionRect.left, y: collisionRect.top },
      context,
    });
    return { result, preventDefault };
  }

  it('I-1 D-1: una sola flecha derecha pasa a la columna vecina, a la tarjeta más cercana', () => {
    expect(press('ArrowRight', 't2').result).toEqual({ x: 194, y: 110 });
    expect(press('ArrowRight', 't1').result).toEqual({ x: 194, y: 0 });
  });

  it('I-1 D-1: aunque el overlay quede una fracción de píxel a la izquierda, no se queda en su columna', () => {
    const { result } = press('ArrowRight', 't2', { shift: { x: -0.4 } });

    expect(result).toEqual({ x: 194, y: 110 });
  });

  it('I-1 D-1: una columna vacía es el destino (su contenedor), y se cruza de largo hacia la siguiente', () => {
    expect(press('ArrowRight', 'p2').result).toEqual({ x: 388, y: 0 });
    expect(press('ArrowRight', 'p2', { overId: 'col:review' }).result).toEqual({ x: 582, y: 0 });
    expect(press('ArrowLeft', 'b1', { overId: 'col:review' }).result).toEqual({ x: 194, y: 0 });
  });

  it('I-1 D-1: no hay columna más allá de los extremos', () => {
    expect(press('ArrowRight', 'b1', { overId: 'b1' }).result).toBeUndefined();
    expect(press('ArrowLeft', 't1').result).toBeUndefined();
  });

  it('I-1 D-1: izquierda vuelve a la columna vecina, no a la primera', () => {
    expect(press('ArrowLeft', 'p2', { overId: 'p2' }).result).toEqual({ x: 0, y: 90 });
  });

  it('I-1 D-1: arriba y abajo se quedan en la columna, sin saltar a la vecina', () => {
    expect(press('ArrowDown', 't1').result).toEqual({ x: 0, y: 90 });
    expect(press('ArrowDown', 't3').result).toBeUndefined();
    expect(press('ArrowUp', 't2', { shift: { y: 0 } }).result).toEqual({ x: 0, y: 0 });
    expect(press('ArrowUp', 't1').result).toBeUndefined();
  });

  it('I-1 D-1: una tecla que no es flecha no hace nada ni se captura', () => {
    const { result, preventDefault } = press('KeyA', 't1');

    expect(result).toBeUndefined();
    expect(preventDefault).not.toHaveBeenCalled();
    expect(press('ArrowDown', 't1').preventDefault).toHaveBeenCalled();
  });
});
