import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    // Todos los archivos comparten db-test: se ejecutan de a uno para que el truncado no se pise.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Tests y soporte de tests; arranque (server.ts), scripts CLI y migraciones (se ejercitan en cada
      // corrida de test pero no son lógica propia, y server.ts/scripts no se pueden cargar sin efectos).
      exclude: [
        'src/**/*.test.ts',
        'src/test/**',
        'src/server.ts',
        'src/scripts/**',
        'src/db/migrations/**',
        'src/db/cli-data-source.ts',
        'src/migrate.ts',
      ],
      reporter: ['text', 'text-summary'],
      thresholds: { lines: 80 },
    },
  },
});
