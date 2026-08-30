import * as bcrypt from 'bcryptjs';
import { DataSource, Repository } from 'typeorm';
import {
  nextSerialCode,
  USER_CODE_PREFIX,
} from '../../common/utils/serial-code.util';
import { ProfileType, User } from '../entities/user.entity';
import { Role } from '../entities/role.entity';

async function generateUniqueUserCode(
  userRepo: Repository<User>,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await nextSerialCode(
      userRepo,
      USER_CODE_PREFIX,
      'code',
      6,
      attempt,
    );
    const existing = await userRepo.findOne({ where: { code } });
    if (!existing) {
      return code;
    }
  }
  throw new Error('Could not generate unique user code');
}

function normalizeRoleCode(raw: string): string {
  return raw
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

export async function seedAdminUser(dataSource: DataSource) {
  const userRepo = dataSource.getRepository(User);
  const roleRepo = dataSource.getRepository(Role);

  console.log('🌱 Seeding admin user...');

  const email = (process.env.ADMIN_EMAIL ?? 'admin@zsparktech.com')
    .toLowerCase()
    .trim();
  const name = (process.env.ADMIN_NAME ?? 'Super Admin').trim();
  const password = process.env.ADMIN_PASSWORD ?? 'demo9090';
  const roleCode = normalizeRoleCode(process.env.ADMIN_ROLE ?? 'SUPER_ADMIN');

  const role = await roleRepo.findOne({ where: { code: roleCode } });
  if (!role) {
    throw new Error(
      `Admin role "${roleCode}" not found. Seed roles before admin user.`,
    );
  }

  const existing = await userRepo.findOne({ where: { email } });
  if (existing) {
    console.log(`⏭ Admin user already exists: ${email}`);
    console.log('🌱 Admin user seeding completed.\n');
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = userRepo.create({
    name,
    email,
    password: hashedPassword,
    profileType: ProfileType.USER,
    role,
    roleId: role.id,
    code: await generateUniqueUserCode(userRepo),
    isEmailVerified: true,
  });
  await userRepo.save(user);

  console.log(`✅ Admin user created: ${email} (${roleCode})`);
  console.log('🌱 Admin user seeding completed.\n');
}

if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { bootstrapSeeder } = require('./run-seeder');
  bootstrapSeeder('Admin', seedAdminUser);
}
