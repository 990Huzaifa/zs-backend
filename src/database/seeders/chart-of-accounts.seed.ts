import { DataSource } from 'typeorm';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../chart-of-accounts/constants/default-chart-of-accounts';
import { parseAccountCodeLevels } from '../chart-of-accounts/utils/parse-account-code-levels';
import {
  ChartOfAccount,
  ChartOfAccountKind,
} from '../entities/chart-of-account.entity';

export async function seedChartOfAccounts(dataSource: DataSource) {
  const repo = dataSource.getRepository(ChartOfAccount);

  console.log('🌱 Seeding chart of accounts...');

  let created = 0;
  let skipped = 0;

  for (const item of DEFAULT_CHART_OF_ACCOUNTS) {
    const existing = await repo.findOne({
      where: { code: item.code },
      withDeleted: true,
    });

    if (existing) {
      skipped += 1;
      console.log(`⏭ COA already exists: ${item.code} (${item.name})`);
      continue;
    }

    const levels = parseAccountCodeLevels(item.code);
    await repo.save(
      repo.create({
        code: item.code,
        parentCode: item.parentCode,
        name: item.name,
        isPostable: item.isPostable,
        accountKind: ChartOfAccountKind.SYSTEM,
        userId: null,
        ...levels,
      }),
    );
    created += 1;
    console.log(`✅ COA created: ${item.code} (${item.name})`);
  }

  console.log(
    `🌱 Chart of accounts seeding completed. created=${created}, skipped=${skipped}\n`,
  );
}

if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { bootstrapSeeder } = require('./run-seeder');
  bootstrapSeeder('Chart of Accounts', seedChartOfAccounts);
}
