import { loadEnv } from '../env.js';
import { createDataSource } from './data-source.js';

// DataSource para el CLI de TypeORM (migration:generate).
loadEnv();
export default createDataSource(process.env['DATABASE_URL']);
