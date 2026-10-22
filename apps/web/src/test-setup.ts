import '@testing-library/jest-dom/vitest';
import { server } from './test/server';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
