import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    // Todos los archivos comparten db-test: se ejecutan de a uno para que el truncado no se pise.
    fileParallelism: false,
  },
});
