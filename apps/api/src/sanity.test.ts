import { describe, expect, it } from 'vitest';

describe('api', () => {
  it('ejecuta vitest en entorno node', () => {
    expect(typeof process.versions.node).toBe('string');
  });
});
