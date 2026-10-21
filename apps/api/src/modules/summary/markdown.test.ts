import { describe, expect, it } from 'vitest';
import { isoWeek } from './markdown.js';

describe('isoWeek (RF-43)', () => {
  it('RF-43 calcula el número de semana ISO', () => {
    expect(isoWeek('2026-10-19')).toBe(43);
    expect(isoWeek('2026-10-25')).toBe(43);
    expect(isoWeek('2026-01-01')).toBe(1);
    expect(isoWeek('2027-01-01')).toBe(53);
    expect(isoWeek('2024-12-30')).toBe(1);
    expect(isoWeek('2021-01-03')).toBe(53);
  });
});
