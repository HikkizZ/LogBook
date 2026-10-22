import { makeCard, withPositions } from '../test/board-fixtures';
import {
  applyMove,
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
