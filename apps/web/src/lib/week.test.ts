import { addDays, isoWeek, mondayOf, weekRange } from './week';

describe('fechas de Mi semana (RF-41)', () => {
  it('la semana ISO va de lunes a domingo', () => {
    expect(weekRange('2026-10-21')).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    expect(mondayOf('2026-10-25')).toBe('2026-10-19'); // domingo
    expect(mondayOf('2026-10-19')).toBe('2026-10-19'); // lunes
  });

  it('numera las semanas ISO, también en el cambio de año', () => {
    expect(isoWeek('2026-10-21')).toBe(43);
    expect(isoWeek('2026-01-01')).toBe(1);
    expect(isoWeek('2027-01-01')).toBe(53); // viernes: pertenece a la semana 53 de 2026
  });

  it('suma días cruzando meses', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
