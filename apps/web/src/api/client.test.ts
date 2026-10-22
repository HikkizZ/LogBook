import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { ApiError, api, configureApiClient } from './client';

const url = (path: string) => `${window.location.origin}/api/v1${path}`;

afterEach(() => configureApiClient({}));

describe('cliente de API', () => {
  it('toda petición mutante lleva X-Logbook-CSRF: 1 y ningún GET lo lleva', async () => {
    const seen: { method: string; csrf: string | null; credentials: string }[] = [];
    server.events.on('request:start', ({ request }) => {
      seen.push({
        method: request.method,
        csrf: request.headers.get('X-Logbook-CSRF'),
        credentials: request.credentials,
      });
    });
    server.use(
      http.all(url('/things'), () => new HttpResponse(null, { status: 204 })),
      http.get(url('/things'), () => HttpResponse.json({ ok: true })),
    );

    await api.get('/things');
    await api.post('/things', { a: 1 });
    await api.patch('/things', { a: 1 });
    await api.put('/things', { a: 1 });
    await api.delete('/things');
    server.events.removeAllListeners();

    expect(seen.map((s) => s.method)).toEqual(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);
    for (const s of seen) {
      expect(s.csrf).toBe(s.method === 'GET' ? null : '1');
      expect(s.credentials).toBe('same-origin');
    }
  });

  it('un 400 expone error.message, code y details', async () => {
    server.use(
      http.post(url('/projects'), () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'name: obligatorio',
              details: [{ path: 'name', message: 'obligatorio' }],
            },
          },
          { status: 400 },
        ),
      ),
    );

    const err = await api.post('/projects', {}).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'name: obligatorio',
      details: [{ path: 'name', message: 'obligatorio' }],
    });
  });

  it('un 401 avisa al manejador; expired solo si antes hubo una respuesta correcta', async () => {
    const onUnauthorized = vi.fn();
    configureApiClient({ onUnauthorized });
    server.use(
      http.get(url('/me'), () =>
        HttpResponse.json({ error: { code: 'UNAUTHORIZED', message: 'x' } }, { status: 401 }),
      ),
      http.get(url('/ok'), () => HttpResponse.json({})),
    );

    await api.get('/me').catch(() => undefined);
    await api.get('/ok');
    await api.get('/me').catch(() => undefined);

    expect(onUnauthorized.mock.calls).toEqual([[{ expired: false }], [{ expired: true }]]);
  });

  it('un 403 pasa error.message al manejador', async () => {
    const onForbidden = vi.fn();
    configureApiClient({ onForbidden });
    server.use(
      http.post(url('/x'), () =>
        HttpResponse.json({ error: { code: 'FORBIDDEN', message: 'Falta CSRF' } }, { status: 403 }),
      ),
    );

    await api.post('/x').catch(() => undefined);

    expect(onForbidden).toHaveBeenCalledWith('Falta CSRF');
  });

  it('un fallo de red lanza ApiError NETWORK', async () => {
    server.use(http.get(url('/down'), () => HttpResponse.error()));

    await expect(api.get('/down')).rejects.toMatchObject({ status: 0, code: 'NETWORK' });
  });
});
