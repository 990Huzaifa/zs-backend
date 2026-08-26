import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDatabaseOptions } from '../../config/database.config';
import { seedTenantPermissions } from './permission.seed';
import { seedTenantRoles } from './role.seed';

loadEnv();

async function seed(): Promise<void> {
  const dataSource = new DataSource(buildDatabaseOptions());
  await dataSource.initialize();

  try {
    console.log('--- Seeding permissions ---');
    await seedTenantPermissions(dataSource);

    console.log('\n--- Seeding roles ---');
    await seedTenantRoles(dataSource);

    console.log('\nAll seeds complete.');
  } finally {
    await dataSource.destroy();
  }
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
