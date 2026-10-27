import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3201,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3200',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // Con un worker por núcleo, jsdom + userEvent satura la CPU y los tests de interacción pasan de
    // los 5 s por tiempo de espera, no por fallo. La mitad de los núcleos deja la suite estable.
    maxWorkers: '50%',
  },
});
