import { DataSource } from 'typeorm';
import { entities } from '../entities/index.js';
import { InitialSchema1760918400000 } from './migrations/1760918400000-InitialSchema.js';

export function createDataSource(url: string | undefined): DataSource {
  if (!url) {
    throw new Error('DATABASE_URL no está definida');
  }
  return new DataSource({
    type: 'postgres',
    url,
    entities,
    migrations: [InitialSchema1760918400000],
    migrationsTableName: 'migrations',
    synchronize: false,
  });
}
