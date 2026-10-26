import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';
import { server } from './test/server';

/**
 * M-2: la primera espera de cada archivo paga el arranque en frío (render del `App`, cascada de peticiones a msw
 * y primera consulta por rol): ~0,6 s solo y ~1,7 s con los 21 archivos en paralelo, por encima del 1 s por
 * defecto de `findBy*`/`waitFor`. Es un techo para ese arranque, no una espera: lo que ya está listo resuelve al instante.
 */
configure({ asyncUtilTimeout: 10_000 });

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
