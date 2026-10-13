import { DataSource, Repository } from 'typeorm';
import { COA_PARENT_CODES } from '../chart-of-accounts/constants/coa-parent-codes';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../chart-of-accounts/constants/default-chart-of-accounts';
import { parseAccountCodeLevels } from '../chart-of-accounts/utils/parse-account-code-levels';
import {
  ChartOfAccount,
  ChartOfAccountKind,
} from '../entities/chart-of-account.entity';
import { Vehicle } from '../entities/vehicle.entity';

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

  await seedVehicleLeaves(dataSource, repo);
}

/** Postable leaf under Vehicles (1-2-1) for each existing vehicle regNo. */
async function seedVehicleLeaves(
  dataSource: DataSource,
  coaRepo: Repository<ChartOfAccount>,
) {
  const parentCode = COA_PARENT_CODES.VEHICLES;
  const parent = await coaRepo.findOne({ where: { code: parentCode } });
  if (!parent) {
    console.log(
      `⚠️  Skip vehicle leaves: parent ${parentCode} not found`,
    );
    return;
  }

  console.log('🌱 Seeding vehicle COA leaves...');

  const vehicleRepo = dataSource.getRepository(Vehicle);
  const vehicles = await vehicleRepo.find({
    select: { id: true, regNo: true },
    order: { regNo: 'ASC' },
  });

  let created = 0;
  let skipped = 0;

  for (const vehicle of vehicles) {
    const name = vehicle.regNo?.trim();
    if (!name) {
      skipped += 1;
      continue;
    }

    const existing = await coaRepo.findOne({
      where: {
        parentCode,
        name,
        accountKind: ChartOfAccountKind.BUSINESS,
      },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    const nextCode = await nextChildCode(parentCode, coaRepo);
    const levels = parseAccountCodeLevels(nextCode);
    await coaRepo.save(
      coaRepo.create({
        code: nextCode,
        parentCode,
        name,
        isPostable: true,
        accountKind: ChartOfAccountKind.BUSINESS,
        userId: null,
        ...levels,
      }),
    );
    created += 1;
    console.log(`✅ Vehicle COA: ${nextCode} (${name})`);
  }

  console.log(
    `🌱 Vehicle COA leaves done. created=${created}, skipped=${skipped}\n`,
  );
}

async function nextChildCode(
  parentCode: string,
  repo: Repository<ChartOfAccount>,
): Promise<string> {
  const children = await repo
    .createQueryBuilder('coa')
    .withDeleted()
    .where('coa.parentCode = :parentCode', { parentCode })
    .getMany();

  let maxSuffix = 0;
  const prefix = `${parentCode}-`;
  for (const child of children) {
    if (!child.code.startsWith(prefix)) continue;
    const suffix = child.code.slice(prefix.length);
    if (!/^\d+$/.test(suffix)) continue;
    const n = Number.parseInt(suffix, 10);
    if (n > maxSuffix) maxSuffix = n;
  }

  return `${parentCode}-${maxSuffix + 1}`;
}

if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { bootstrapSeeder } = require('./run-seeder');
  bootstrapSeeder('Chart of Accounts', seedChartOfAccounts);
}
