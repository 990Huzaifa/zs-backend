import { DataSource } from 'typeorm';
import { Permission } from '../entities/permission.entity';

export const TENANT_PERMISSIONS = [
  // Users
  { code: 'CREATE_USER', name: 'Create User' },
  { code: 'VIEW_USER', name: 'View User' },
  { code: 'UPDATE_USER', name: 'Update User' },
  { code: 'DELETE_USER', name: 'Delete User' },

  // Roles
  { code: 'CREATE_ROLE', name: 'Create Role' },
  { code: 'VIEW_ROLE', name: 'View Role' },
  { code: 'UPDATE_ROLE', name: 'Update Role' },
  { code: 'DELETE_ROLE', name: 'Delete Role' },

  // Permissions
  { code: 'VIEW_PERMISSION', name: 'View Permission' },
  { code: 'ASSIGN_PERMISSION', name: 'Assign Permission' },

  // Drivers
  { code: 'CREATE_DRIVER', name: 'Create Driver' },
  { code: 'VIEW_DRIVER', name: 'View Driver' },
  { code: 'UPDATE_DRIVER', name: 'Update Driver' },
  { code: 'DELETE_DRIVER', name: 'Delete Driver' },

  // Assigned Vehicles
  { code: 'CREATE_ASSIGNED_VEHICLE', name: 'Create Assigned Vehicle' },
  { code: 'VIEW_ASSIGNED_VEHICLE', name: 'View Assigned Vehicle' },
  { code: 'UPDATE_ASSIGNED_VEHICLE', name: 'Update Assigned Vehicle' },
  { code: 'DELETE_ASSIGNED_VEHICLE', name: 'Delete Assigned Vehicle' },

  // Clients
  { code: 'CREATE_CLIENT', name: 'Create Client' },
  { code: 'VIEW_CLIENT', name: 'View Client' },
  { code: 'UPDATE_CLIENT', name: 'Update Client' },
  { code: 'DELETE_CLIENT', name: 'Delete Client' },

  // Client Rates
  { code: 'CREATE_CLIENT_RATE', name: 'Create Client Rate' },
  { code: 'VIEW_CLIENT_RATE', name: 'View Client Rate' },
  { code: 'UPDATE_CLIENT_RATE', name: 'Update Client Rate' },
  { code: 'DELETE_CLIENT_RATE', name: 'Delete Client Rate' },

  // Warehouses
  { code: 'CREATE_WAREHOUSE', name: 'Create Warehouse' },
  { code: 'VIEW_WAREHOUSE', name: 'View Warehouse' },
  { code: 'UPDATE_WAREHOUSE', name: 'Update Warehouse' },
  { code: 'DELETE_WAREHOUSE', name: 'Delete Warehouse' },

  // Tax Rules
  { code: 'CREATE_TAX_RULE', name: 'Create Tax Rule' },
  { code: 'VIEW_TAX_RULE', name: 'View Tax Rule' },
  { code: 'UPDATE_TAX_RULE', name: 'Update Tax Rule' },
  { code: 'DELETE_TAX_RULE', name: 'Delete Tax Rule' },

  // Vendors
  { code: 'CREATE_VENDOR', name: 'Create Vendor' },
  { code: 'VIEW_VENDOR', name: 'View Vendor' },
  { code: 'UPDATE_VENDOR', name: 'Update Vendor' },
  { code: 'DELETE_VENDOR', name: 'Delete Vendor' },

  // Vendor Categories
  { code: 'CREATE_VENDOR_CATEGORY', name: 'Create Vendor Category' },
  { code: 'VIEW_VENDOR_CATEGORY', name: 'View Vendor Category' },
  { code: 'UPDATE_VENDOR_CATEGORY', name: 'Update Vendor Category' },
  { code: 'DELETE_VENDOR_CATEGORY', name: 'Delete Vendor Category' },

  // Vendor Products
  { code: 'CREATE_VENDOR_PRODUCT', name: 'Create Vendor Product' },
  { code: 'VIEW_VENDOR_PRODUCT', name: 'View Vendor Product' },
  { code: 'UPDATE_VENDOR_PRODUCT', name: 'Update Vendor Product' },
  { code: 'DELETE_VENDOR_PRODUCT', name: 'Delete Vendor Product' },

  // Vendor Rates
  { code: 'CREATE_VENDOR_RATE', name: 'Create Vendor Rate' },
  { code: 'VIEW_VENDOR_RATE', name: 'View Vendor Rate' },
  { code: 'UPDATE_VENDOR_RATE', name: 'Update Vendor Rate' },
  { code: 'DELETE_VENDOR_RATE', name: 'Delete Vendor Rate' },

  // Vehicles
  { code: 'CREATE_VEHICLE', name: 'Create Vehicle' },
  { code: 'VIEW_VEHICLE', name: 'View Vehicle' },
  { code: 'UPDATE_VEHICLE', name: 'Update Vehicle' },
  { code: 'DELETE_VEHICLE', name: 'Delete Vehicle' },

  // Vehicle Types
  { code: 'CREATE_VEHICLE_TYPE', name: 'Create Vehicle Type' },
  { code: 'VIEW_VEHICLE_TYPE', name: 'View Vehicle Type' },
  { code: 'UPDATE_VEHICLE_TYPE', name: 'Update Vehicle Type' },
  { code: 'DELETE_VEHICLE_TYPE', name: 'Delete Vehicle Type' },

  // Vehicle Sizes
  { code: 'CREATE_VEHICLE_SIZE', name: 'Create Vehicle Size' },
  { code: 'VIEW_VEHICLE_SIZE', name: 'View Vehicle Size' },
  { code: 'UPDATE_VEHICLE_SIZE', name: 'Update Vehicle Size' },
  { code: 'DELETE_VEHICLE_SIZE', name: 'Delete Vehicle Size' },

  // Vehicle Capacities
  { code: 'CREATE_VEHICLE_CAPACITY', name: 'Create Vehicle Capacity' },
  { code: 'VIEW_VEHICLE_CAPACITY', name: 'View Vehicle Capacity' },
  { code: 'UPDATE_VEHICLE_CAPACITY', name: 'Update Vehicle Capacity' },
  { code: 'DELETE_VEHICLE_CAPACITY', name: 'Delete Vehicle Capacity' },

  // Chart of Accounts
  { code: 'CREATE_CHART_OF_ACCOUNT', name: 'Create Chart of Account' },
  { code: 'VIEW_CHART_OF_ACCOUNT', name: 'View Chart of Account' },
  { code: 'UPDATE_CHART_OF_ACCOUNT', name: 'Update Chart of Account' },
  { code: 'DELETE_CHART_OF_ACCOUNT', name: 'Delete Chart of Account' },

  // Bilty
  { code: 'CREATE_BILTY', name: 'Create Bilty' },
  { code: 'VIEW_BILTY', name: 'View Bilty' },
  { code: 'UPDATE_BILTY', name: 'Update Bilty' },
  { code: 'DELETE_BILTY', name: 'Delete Bilty' },

  // Trips
  { code: 'CREATE_TRIP', name: 'Create Trip' },
  { code: 'VIEW_TRIP', name: 'View Trip' },
  { code: 'UPDATE_TRIP', name: 'Update Trip' },
  { code: 'DELETE_TRIP', name: 'Delete Trip' },

  // Activities (audit / logs — view only)
  { code: 'VIEW_ACTIVITY', name: 'View Activity' },

  // Geo
  { code: 'VIEW_COUNTRY', name: 'View Country' },
  { code: 'VIEW_STATE', name: 'View State' },
  { code: 'VIEW_CITY', name: 'View City' },

  // System settings
  { code: 'VIEW_SYSTEM_SETTING', name: 'View System Setting' },
  { code: 'UPDATE_SYSTEM_SETTING', name: 'Update System Setting' },
];

export async function seedTenantPermissions(dataSource: DataSource) {
  const permissionRepo = dataSource.getRepository(Permission);

  console.log('🌱 Seeding tenant permissions...');

  for (const permissionData of TENANT_PERMISSIONS) {
    const code = permissionData.code.trim();
    const name = permissionData.name.trim();
    if (!code || !name) {
      continue;
    }

    const existing = await permissionRepo.findOne({
      where: { code },
    });

    if (!existing) {
      const permission = permissionRepo.create({
        code,
        name,
        isActive: true,
      });
      await permissionRepo.save(permission);
    } else {
      let shouldUpdate = false;
      if (existing.name !== name) {
        existing.name = name;
        shouldUpdate = true;
      }
      if (!existing.isActive) {
        existing.isActive = true;
        shouldUpdate = true;
      }
      if (shouldUpdate) {
        await permissionRepo.save(existing);
      }
      console.log(`⏭ Permission already exists: ${code}`);
    }
  }

  console.log('🌱 Tenant permission seeding completed.\n');
}

if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { bootstrapSeeder } = require('./run-seeder');
  bootstrapSeeder('Permissions', seedTenantPermissions);
}
