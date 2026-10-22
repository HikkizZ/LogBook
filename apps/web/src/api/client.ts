/**
 * Cliente de la API (docs/api.md, ADR 0001). La autenticación es una cookie `httpOnly` que manda el
 * navegador: este módulo no maneja tokens ni guarda nada de la sesión en el navegador.
 */

const BASE = '/api/v1';
const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: { path: string; message: string }[] | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface ApiHandlers {
  /** 401 en una petición ya autenticada. `expired` = la sesión estaba activa en esta carga de página. */
  onUnauthorized?: (info: { expired: boolean }) => void;
  /** 403: en la UI significa que faltó el header CSRF o que `Origin` no coincide (un bug). */
  onForbidden?: (message: string) => void;
}

let handlers: ApiHandlers = {};
/** Solo en memoria: ¿hubo alguna respuesta correcta autenticada en esta carga de página? */
let sessionActive = false;

export function configureApiClient(next: ApiHandlers): void {
  handlers = next;
  sessionActive = false;
}

interface RequestOptions {
  body?: unknown;
  /** `POST /auth/login`: un 401 es "contraseña incorrecta", no una sesión vencida. */
  skipUnauthorizedHandler?: boolean;
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (MUTATING.has(method)) headers['X-Logbook-CSRF'] = '1';
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${window.location.origin}${BASE}${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'No se pudo conectar con el servidor');
  }

  if (res.ok) {
    sessionActive = !path.startsWith('/auth/logout');
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  const error = await readError(res);
  if (res.status === 401 && !options.skipUnauthorizedHandler) {
    const expired = sessionActive;
    sessionActive = false;
    handlers.onUnauthorized?.({ expired });
  } else if (res.status === 403) {
    handlers.onForbidden?.(error.message);
  }
  throw error;
}

async function readError(res: Response): Promise<ApiError> {
  try {
    const json = (await res.json()) as {
      error?: { code?: string; message?: string; details?: { path: string; message: string }[] };
    };
    const e = json.error;
    return new ApiError(
      res.status,
      e?.code ?? 'UNKNOWN',
      e?.message ?? `Error ${res.status}`,
      e?.details,
    );
  } catch {
    return new ApiError(res.status, 'UNKNOWN', `Error ${res.status}`);
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(
    path: string,
    body?: unknown,
    options?: Pick<RequestOptions, 'skipUnauthorizedHandler'>,
  ) => request<T>('POST', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  delete: <T = void>(path: string) => request<T>('DELETE', path),
};
