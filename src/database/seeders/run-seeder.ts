import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDatabaseOptions } from '../../config/database.config';

loadEnv();

/**
 * Run a single seeder against a fresh DataSource connection.
 * Used by: npm run seed:permissions | seed:roles | seed:admin
 */
export async function runSeeder(
  label: string,
  seedFn: (dataSource: DataSource) => Promise<void>,
): Promise<void> {
  const dataSource = new DataSource(buildDatabaseOptions());
  await dataSource.initialize();
  try {
    await seedFn(dataSource);
  } finally {
    await dataSource.destroy();
  }
}

export function bootstrapSeeder(
  label: string,
  seedFn: (dataSource: DataSource) => Promise<void>,
): void {
  runSeeder(label, seedFn)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`${label} seed failed:`, error);
      process.exit(1);
    });
}
