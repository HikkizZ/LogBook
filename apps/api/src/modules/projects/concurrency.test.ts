import { describe, expect, it } from 'vitest';
import { client } from '../../test/helpers.js';

describe('I-9 POST /projects concurrente', () => {
  it('I-9: doce altas simultáneas con el mismo nombre → una 201 y el resto 409 CONFLICT, ningún 500', async () => {
    const api = await client();
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        api.post('/projects').send({ name: 'Mismo nombre', color: 'violeta' }),
      ),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses, JSON.stringify(results.map((r) => r.body))).toEqual([
      201,
      ...Array<number>(11).fill(409),
    ]);
    for (const r of results.filter((x) => x.status === 409)) {
      expect((r.body as { error: { code: string } }).error.code).toBe('CONFLICT');
    }
  });

  it('I-9: nombres distintos con el mismo slug, en paralelo, reciben slugs distintos (-2, -3…)', async () => {
    const api = await client();
    const names = ['Foo Bar', 'foo-bar', 'FOO bar!', 'foo_bar'];
    const results = await Promise.all(
      names.map((name) => api.post('/projects').send({ name, color: 'violeta' })),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    const slugs = results.map((r) => (r.body as { slug: string }).slug).sort();
    expect(slugs).toEqual(['foo-bar', 'foo-bar-2', 'foo-bar-3', 'foo-bar-4']);
  });
});
