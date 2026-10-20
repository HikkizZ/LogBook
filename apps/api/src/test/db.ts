import type { DataSource } from 'typeorm';

let current: DataSource | undefined;

export function setTestDataSource(dataSource: DataSource): void {
  current = dataSource;
}

/** DataSource conectado a db-test, abierto por src/test/setup.ts para cada archivo de test. */
export function testDataSource(): DataSource {
  if (!current) {
    throw new Error('El DataSource de test no está inicializado (falta src/test/setup.ts)');
  }
  return current;
}
