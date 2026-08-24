import { DataSource } from 'typeorm';
import { Permission } from '../entities/permission.entity';

export const TENANT_PERMISSIONS = [
  { code: 'CREATE_USER', name: 'Create Users' },
  { code: 'CREATE_ROLE', name: 'Create Role' },
  { code: 'CREATE_DESIGNATION', name: 'Create Designation' },
  { code: 'CREATE_DISTRIBUTOR', name: 'Create Distributor' },
  { code: 'CREATE_PRODUCT_CATEGORY', name: 'Create Category' },
  { code: 'CREATE_PRODUCT_BRAND', name: 'Create Brand' },
  { code: 'CREATE_PRODUCT', name: 'Create Product' },
  { code: 'CREATE_FLAVOUR', name: 'Create Flavour' },
  { code: 'CREATE_UOM', name: 'Create UOM' },
  { code: 'CREATE_RETAILER_CATEGORY', name: 'Create Retailer Category' },
  { code: 'CREATE_RETAILER_CHANNEL', name: 'Create Retailer Channel' },
  { code: 'CREATE_RETAILER', name: 'Create Retailer' },
  { code: 'CREATE_RETAILER_VISIT', name: 'Create Retailer Visit' },
  { code: 'CREATE_REGION', name: 'Create Region' },
  { code: 'CREATE_AREA', name: 'Create Area' },
  { code: 'CREATE_SALE_ORDER', name: 'Create Sale Order' },
  { code: 'CREATE_SALE_INVOICE', name: 'Create Sale Invoice' },
  { code: 'CREATE_SALE_RETURN', name: 'Create Sale Return' },
  { code: 'CREATE_SALE_VOUCHER', name: 'Create Sale Voucher' },
  { code: 'CREATE_SCHEME', name: 'Create Scheme' },
  { code: 'CREATE_ROUTE', name: 'Create Route' },
  { code: 'CREATE_ROUTE_SHARE', name: 'Create Route Share' },
  { code: 'CREATE_PJP', name: 'Create PJP' },
  { code: 'CREATE_TARGET_PLAN', name: 'Create Target Plan' },
  { code: 'CREATE_LOADSHEET', name: 'Create Loadsheet' },
  { code: 'CREATE_OPENING_STOCK', name: 'Create Opening Stock' },
  { code: 'CREATE_PURCHASE_STOCK', name: 'Create Purchase Stock' },
  { code: 'CREATE_TRANSFER_STOCK', name: 'Create Transfer Stock' },
  { code: 'CHECK_IN_ATTENDANCE', name: 'Check In Attendance' },
  { code: 'CHECK_OUT_ATTENDANCE', name: 'Check Out Attendance' },

  { code: 'LIST_USER', name: 'List Users' },
  { code: 'LIST_ROLE', name: 'List Role' },
  { code: 'LIST_DESIGNATION', name: 'List Designation' },
  { code: 'LIST_DISTRIBUTOR', name: 'List Distributor' },
  { code: 'LIST_PRODUCT_CATEGORY', name: 'List Category' },
  { code: 'LIST_PRODUCT_BRAND', name: 'List Brand' },
  { code: 'LIST_PRODUCT', name: 'List Product' },
  { code: 'LIST_FLAVOUR', name: 'List Flavour' },
  { code: 'LIST_UOM', name: 'List UOM' },
  { code: 'LIST_RETAILER_CATEGORY', name: 'List Retailer Category' },
  { code: 'LIST_RETAILER_CHANNEL', name: 'List Retailer Channel' },
  { code: 'LIST_RETAILER', name: 'List Retailer' },
  { code: 'LIST_RETAILER_VISIT', name: 'List Retailer Visit' },
  { code: 'SALESMAN_SYNC_DOWN', name: 'Salesman Sync Down' },
  { code: 'SALESMAN_SYNC_UP', name: 'Salesman Sync Up' },
  { code: 'MERCHANDISER_SYNC_DOWN', name: 'Merchandiser Sync Down' },
  { code: 'MERCHANDISER_SYNC_UP', name: 'Merchandiser Sync Up' },
  { code: 'SPG_SYNC_DOWN', name: 'SPG Sync Down' },
  { code: 'RIDER_SYNC_DOWN', name: 'Rider Sync Down' },
  { code: 'RIDER_SYNC_UP', name: 'Rider Sync Up' },
  { code: 'LIST_RETAILER_LEDGER', name: 'List Retailer' },
  { code: 'LIST_REGION', name: 'List Region' },
  { code: 'LIST_AREA', name: 'List Area' },
  { code: 'LIST_SALE_ORDER', name: 'List Sale Order' },
  { code: 'LIST_SALE_INVOICE', name: 'List Sale Invoice' },
  { code: 'LIST_SALE_RETURN', name: 'List Sales Return' },
  { code: 'LIST_SALE_VOUCHER', name: 'List Sale Voucher' },
  { code: 'LIST_SCHEME', name: 'List Scheme' },
  { code: 'LIST_ROUTE', name: 'List Route' },
  { code: 'LIST_ROUTE_SHARE', name: 'List Route Share' },
  { code: 'LIST_PJP', name: 'List PJP' },
  { code: 'LIST_TARGET_PLAN', name: 'List Target Plan' },
  { code: 'LIST_LOADSHEET', name: 'List Loadsheet' },
  { code: 'LIST_OPENING_STOCK', name: 'List Opening Stock' },
  { code: 'LIST_PURCHASE_STOCK', name: 'List Purchase Stock' },
  { code: 'LIST_TRANSFER_STOCK', name: 'List Transfer Stock' },
  { code: 'LIST_ATTENDANCE', name: 'List Attendance' },
  { code: 'VIEW_INVENTORY_REPORT', name: 'View Inventory Report' },
  {
    code: 'VIEW_INVENTORY_FORECAST_REPORT',
    name: 'View Inventory Forecast Report',
  },
  { code: 'VIEW_RETAILER_VISIT_REPORT', name: 'View Retailer Visit Report' },
  { code: 'VIEW_RETAILER_CHECKIN_REPORT', name: 'View Retailer Check-In Report' },
  { code: 'VIEW_RETAILER_MERCHANDISING_REPORT', name: 'View Retailer Merchandising Report' },
  { code: 'VIEW_DASHBOARD', name: 'View Dashboard' },

  { code: 'UPDATE_USER', name: 'Update Users' },
  { code: 'UPDATE_ROLE', name: 'Update Role' },
  { code: 'UPDATE_DESIGNATION', name: 'Update Designation' },
  { code: 'UPDATE_DISTRIBUTOR', name: 'Update Distributor' },
  { code: 'UPDATE_PRODUCT_CATEGORY', name: 'Update Category' },
  { code: 'UPDATE_PRODUCT_PRICING', name: 'Update Pricing' },
  { code: 'UPDATE_PRODUCT_BRAND', name: 'Update Brand' },
  { code: 'UPDATE_PRODUCT', name: 'Update Product' },
  { code: 'UPDATE_FLAVOUR', name: 'Update Flavour' },
  { code: 'UPDATE_UOM', name: 'Update UOM' },
  { code: 'UPDATE_RETAILER_CATEGORY', name: 'Update Retailer Category' },
  { code: 'UPDATE_RETAILER_CHANNEL', name: 'Update Retailer Channel' },
  { code: 'UPDATE_RETAILER', name: 'Update Retailer' },
  { code: 'UPDATE_REGION', name: 'Update Region' },
  { code: 'UPDATE_AREA', name: 'Update Area' },
  { code: 'UPDATE_SALE_ORDER', name: 'Update Sale Order' },
  { code: 'UPDATE_SALE_INVOICE', name: 'Update Sale Invoice' },
  { code: 'UPDATE_SALE_RETURN', name: 'Update Sale Return' },
  { code: 'UPDATE_SALE_VOUCHER', name: 'Update Sale Voucher' },
  { code: 'UPDATE_SCHEME', name: 'Update Scheme' },
  { code: 'UPDATE_ROUTE', name: 'Update Route' },
  { code: 'UPDATE_ROUTE_SHARE', name: 'Update Route Share' },
  { code: 'UPDATE_PJP', name: 'Update PJP' },
  { code: 'UPDATE_TARGET_PLAN', name: 'Update Target Plan' },
  { code: 'UPDATE_TARGET_PLAN_STATUS', name: 'Update Target Plan Status' },
  { code: 'RECALCULATE_TARGET_PLAN', name: 'Recalculate Target Plan' },
  { code: 'UPDATE_LOADSHEET', name: 'Update Loadsheet' },
  { code: 'UPDATE_LOADSHEET_STATUS', name: 'Update Loadsheet Status' },
  { code: 'UPDATE_OPENING_STOCK', name: 'Update Opening Stock' },
  { code: 'UPDATE_PURCHASE_STOCK', name: 'Update Purchase Stock' },
  { code: 'UPDATE_TRANSFER_STOCK', name: 'Update Transfer Stock' },

  { code: 'VIEW_USER', name: 'View Users' },
  { code: 'VIEW_ROLE', name: 'View Role' },
  { code: 'VIEW_DESIGNATION', name: 'View Designation' },
  { code: 'VIEW_DISTRIBUTOR', name: 'View Distributor' },
  { code: 'VIEW_PRODUCT_CATEGORY', name: 'View Category' },
  { code: 'VIEW_PRODUCT_BRAND', name: 'View Brand' },
  { code: 'VIEW_PRODUCT', name: 'View Product' },
  { code: 'VIEW_FLAVOUR', name: 'View Flavour' },
  { code: 'VIEW_UOM', name: 'View UOM' },
  { code: 'VIEW_RETAILER_CATEGORY', name: 'View Retailer Category' },
  { code: 'VIEW_RETAILER_CHANNEL', name: 'View Retailer Channel' },
  { code: 'VIEW_RETAILER', name: 'View Retailer' },
  { code: 'VIEW_RETAILER_VISIT', name: 'View Retailer Visit' },
  { code: 'VIEW_REGION', name: 'View Region' },
  { code: 'VIEW_AREA', name: 'View Area' },
  { code: 'VIEW_SALE_ORDER', name: 'View Sale Order' },
  { code: 'VIEW_SALE_INVOICE', name: 'View Sale Invoice' },
  { code: 'VIEW_SALE_RETURN', name: 'View Sale Return' },
  { code: 'VIEW_SALE_VOUCHER', name: 'View Sale Voucher' },
  { code: 'VIEW_SCHEME', name: 'View Scheme' },
  { code: 'VIEW_ROUTE', name: 'View Route' },
  { code: 'VIEW_ROUTE_SHARE', name: 'View Route Share' },
  { code: 'VIEW_PJP', name: 'View PJP' },
  { code: 'VIEW_TARGET_PLAN', name: 'View Target Plan' },
  { code: 'VIEW_LOADSHEET', name: 'View Loadsheet' },
  { code: 'PRINT_LOADSHEET', name: 'Print Loadsheet' },
  { code: 'VIEW_OPENING_STOCK', name: 'View Opening Stock' },
  { code: 'VIEW_PURCHASE_STOCK', name: 'View Purchase Stock' },
  { code: 'VIEW_TRANSFER_STOCK', name: 'View Transfer Stock' },
  { code: 'VIEW_ATTENDANCE', name: 'View Attendance' },

  { code: 'DELETE_USER', name: 'Delete Users' },
  { code: 'DELETE_ROLE', name: 'Delete Role' },
  { code: 'DELETE_DESIGNATION', name: 'Delete Designation' },
  { code: 'DELETE_PRODUCT_CATEGORY', name: 'Delete Category' },
  { code: 'DELETE_PRODUCT_BRAND', name: 'Delete Brand' },
  { code: 'DELETE_PRODUCT', name: 'Delete Product' },
  { code: 'DELETE_FLAVOUR', name: 'Delete Flavour' },
  { code: 'DELETE_UOM', name: 'Delete UOM' },
  { code: 'DELETE_RETAILER_CATEGORY', name: 'Delete Retailer Category' },
  { code: 'DELETE_RETAILER_CHANNEL', name: 'Delete Retailer Channel' },
  { code: 'DELETE_RETAILER', name: 'Delete Retailer' },
  { code: 'DELETE_REGION', name: 'Delete Region' },
  { code: 'DELETE_AREA', name: 'Delete Area' },
  { code: 'DELETE_SALE_ORDER', name: 'Delete Sale Order' },
  { code: 'DELETE_SALE_RETURN', name: 'Delete Sale Return' },
  { code: 'DELETE_SCHEME', name: 'Delete Scheme' },
  { code: 'DELETE_ROUTE', name: 'Delete Route' },
  { code: 'DELETE_ROUTE_SHARE', name: 'Delete Route Share' },
  { code: 'DELETE_PJP', name: 'Delete PJP' },
  { code: 'DELETE_TARGET_PLAN', name: 'Delete Target Plan' },
  { code: 'DELETE_LOADSHEET', name: 'Delete Loadsheet' },
  { code: 'DELETE_OPENING_STOCK', name: 'Delete Opening Stock' },
  { code: 'DELETE_PURCHASE_STOCK', name: 'Delete Purchase Stock' },
  { code: 'DELETE_TRANSFER_STOCK', name: 'Delete Transfer Stock' },


  { code: 'TRANSFER_ROUTE', name: 'Transfer Route' },
  { code: 'TRANSFER_RETAILER_ROUTE', name: 'Transfer Retailer Route' },
  { code: 'SHARE_ROUTE', name: 'Share Route' },


  
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
