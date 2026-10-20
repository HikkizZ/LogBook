import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// Raíz del repo: tanto src/ como dist/ viven en apps/api/, así que son tres niveles hacia arriba.
const rootFile = (name: string): string =>
  fileURLToPath(new URL(`../../../${name}`, import.meta.url));

/** Carga el .env de la raíz. Las variables ya definidas en el entorno tienen prioridad. */
export function loadEnv(): void {
  config({ path: rootFile('.env'), quiet: true });
}

/** Carga el .env.test de la raíz y pisa lo que haya en el entorno: los tests siempre usan db-test. */
export function loadTestEnv(): void {
  config({ path: rootFile('.env.test'), override: true, quiet: true });
}
