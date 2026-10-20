import type { DataSource } from 'typeorm';

let current: DataSource | undefined;

/** Registra el DataSource que usan los módulos de auth. Lo llama el arranque (y el setup de tests). */
export function setDataSource(dataSource: DataSource): void {
  current = dataSource;
}

export function getDataSource(): DataSource {
  if (!current) {
    throw new Error('El DataSource no está inicializado');
  }
  return current;
}
