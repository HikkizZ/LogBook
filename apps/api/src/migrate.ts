import { createDataSource } from './db/data-source.js';
import { loadEnv } from './env.js';

// Sin argumentos corre las migraciones pendientes; con `revert` deshace la última.
loadEnv();
const dataSource = createDataSource(process.env['DATABASE_URL']);
const revert = process.argv[2] === 'revert';

try {
  await dataSource.initialize();
  if (revert) {
    await dataSource.undoLastMigration();
  } else {
    const executed = await dataSource.runMigrations();
    console.log(`Migraciones ejecutadas: ${executed.map((m) => m.name).join(', ') || 'ninguna'}`);
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (dataSource.isInitialized) {
    await dataSource.destroy();
  }
}
