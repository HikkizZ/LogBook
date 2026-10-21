import { describe, expect, it } from 'vitest';
import { assertTimezone } from './clock.js';

describe('I-14 APP_TIMEZONE se valida al arrancar', () => {
  it('I-14: vacía o con solo espacios es válida (la app usa UTC)', () => {
    expect(() => assertTimezone('')).not.toThrow();
    expect(() => assertTimezone('  ')).not.toThrow();
  });

  it('I-14: una zona IANA válida pasa', () => {
    expect(() => assertTimezone('America/Santiago')).not.toThrow();
    expect(() => assertTimezone('UTC')).not.toThrow();
  });

  it('I-14: una zona inválida lanza con un mensaje que nombra la variable', () => {
    expect(() => assertTimezone('Marte/Olympus')).toThrow(/APP_TIMEZONE/);
    expect(() => assertTimezone('no-es-zona')).toThrow(/APP_TIMEZONE/);
  });
});
