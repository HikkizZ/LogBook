import { afterAll, beforeAll, beforeEach } from 'vitest';
import { setDataSource } from '../db/client.js';
import { createDataSource } from '../db/data-source.js';
import { loadTestEnv } from '../env.js';
import { setTestDataSource, testDataSource } from './db.js';

// Corre antes de cada archivo de test: conecta a db-test, migra y trunca entre tests.
loadTestEnv();

beforeAll(async () => {
  const dataSource = createDataSource(process.env['DATABASE_URL']);
  await dataSource.initialize();
  await dataSource.runMigrations();
  setTestDataSource(dataSource);
  setDataSource(dataSource);
});

beforeEach(async () => {
  const tables = await testDataSource().query<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migrations'`,
  );
  const list = tables.map((t) => `"${t.tablename}"`).join(', ');
  await testDataSource().query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await testDataSource().destroy();
});
