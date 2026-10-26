import { formatAbsolute, formatLogTime, localInputToIso, toLocalInput } from './dates';

const SANTIAGO = 'America/Santiago';

describe('formatLogTime (§4.2)', () => {
  // 2026-10-21 15:00 UTC = 12:00 en Santiago (UTC-3, horario de verano).
  const now = new Date('2026-10-21T15:00:00.000Z');

  it('hoy lleva la hora: "hoy 14:32"', () => {
    expect(formatLogTime('2026-10-21T17:32:00.000Z', SANTIAGO, now)).toBe('hoy 14:32');
  });

  it('ayer va sin hora', () => {
    expect(formatLogTime('2026-10-20T17:32:00.000Z', SANTIAGO, now)).toBe('ayer');
  });

  it('antes de ayer: día de la semana, día y mes ("mar 14 oct")', () => {
    expect(formatLogTime('2026-10-13T17:32:00.000Z', SANTIAGO, now)).toBe('mar 13 oct');
  });

  it('el día se cuenta en la zona de Ajustes, no en UTC', () => {
    // 02:30 UTC del 22 es todavía el 21 en Santiago: sigue siendo "hoy".
    expect(formatLogTime('2026-10-22T02:30:00.000Z', SANTIAGO, now)).toBe('hoy 23:30');
  });
});

describe('formatAbsolute', () => {
  it('fecha completa y hora en la zona dada', () => {
    expect(formatAbsolute('2026-10-13T17:32:00.000Z', SANTIAGO)).toBe('martes 13 oct 2026, 14:32');
  });
});

describe('localInputToIso / toLocalInput (RF-30)', () => {
  it('interpreta el datetime-local en la zona de Ajustes', () => {
    expect(localInputToIso('2026-10-20T16:00', SANTIAGO)).toBe('2026-10-20T19:00:00.000Z');
    expect(localInputToIso('2026-06-20T16:00', SANTIAGO)).toBe('2026-06-20T20:00:00.000Z');
    expect(localInputToIso('2026-10-20T16:00', 'UTC')).toBe('2026-10-20T16:00:00.000Z');
  });

  it('rechaza un texto que no es fecha', () => {
    expect(localInputToIso('', SANTIAGO)).toBeNull();
    expect(localInputToIso('ayer', SANTIAGO)).toBeNull();
  });

  it('son inversas', () => {
    const iso = '2026-10-20T19:00:00.000Z';
    const local = toLocalInput(new Date(iso), SANTIAGO);
    expect(local).toBe('2026-10-20T16:00');
    expect(localInputToIso(local, SANTIAGO)).toBe(iso);
  });
});
