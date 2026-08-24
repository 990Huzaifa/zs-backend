import { DataSource } from 'typeorm';
import { Permission } from '../entities/permission.entity';
import { Role } from '../entities/role.entity';

export const TENANT_ROLES = [
    {
        code: 'SUPER_ADMIN',
        name: 'Super Admin',
        isActive: true,
    },
];

export async function seedTenantRoles(dataSource: DataSource) {
    const roleRepo = dataSource.getRepository(Role);
    const permissionRepo = dataSource.getRepository(Permission);

    console.log('🌱 Seeding tenant roles...');

    for (const roleData of TENANT_ROLES) {
        const roleName = roleData.name.trim();
        if (!roleName) {
            continue;
        }

        const roleCode = roleData.code.trim().toUpperCase();
        const existing = await roleRepo.findOne({
            where: { code: roleCode },
        });

        if (!existing) {
            const role = roleRepo.create({
                code: roleCode,
                name: roleName,
                isActive: roleData.isActive ?? true,
            });
            await roleRepo.save(role);
            console.log(`✅ Role created: ${roleName} (${roleCode})`);
        } else {
            console.log(`⏭ Role already exists: ${roleName} (${roleCode})`);
        }
    }

    const superAdminRole = await roleRepo.findOne({
        where: { name: 'Super Admin' },
        relations: ['permissions'],
    });
    if (superAdminRole) {
        const permissions = await permissionRepo.find({
            where: { isActive: true },
        });
        superAdminRole.permissions = permissions;
        await roleRepo.save(superAdminRole);
        console.log('✅ Super Admin role permissions assigned');
    }

    console.log('🌱 Tenant role seeding completed.\n');
}
