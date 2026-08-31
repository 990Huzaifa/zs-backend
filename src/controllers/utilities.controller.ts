import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { VehicleStatus } from '../database/entities/vehicle.entity';
import {
  RateStatus,
  VendorStatus,
} from '../database/entities/vendor.entity';
import { AssignedVehiclesService } from '../services/assigned-vehicles.service';
import { ClientRatesService } from '../services/client-rates.service';
import { RolesService } from '../services/roles.service';
import { TaxRulesService } from '../services/tax-rules.service';
import { VehicleCapacitiesService } from '../services/vehicle-capacities.service';
import { VehicleSizesService } from '../services/vehicle-sizes.service';
import { VehicleTypesService } from '../services/vehicle-types.service';
import { VendorCategoriesService } from '../services/vendor-categories.service';
import { VendorRatesService } from '../services/vendor-rates.service';
import { VendorsService } from '../services/vendors.service';
import { VehiclesService } from '../services/vehicles.service';

class PermissionsUtilityQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}

class SaleTaxUtilityQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  /** Default ACTIVE — currently effective rules for client form */
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE', 'EXPIRED', 'UPCOMING'])
  displayStatus?: 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'UPCOMING';
}

class VendorCategoryUtilityQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}

class VendorUtilityQueryDto {
  @IsOptional()
  @IsUUID()
  vendorCategoryId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  /** Default ACTIVE */
  @IsOptional()
  @IsEnum(VendorStatus)
  status?: VendorStatus;
}

class VendorProductUtilityQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}

class VendorRateUtilityQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cityId?: number;

  /** Default ACTIVE */
  @IsOptional()
  @IsEnum(RateStatus)
  status?: RateStatus;
}

class VehicleUtilityQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  /** Default ACTIVE */
  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;

  @IsOptional()
  @IsUUID()
  vehicleTypeId?: string;

  @IsOptional()
  @IsUUID()
  vehicleSizeId?: string;

  @IsOptional()
  @IsUUID()
  vehicleCapacityId?: string;
}

class VehicleMasterUtilityQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  /**
   * Optional; accepted for cascade UIs but not required.
   * Size/capacity masters are independent of type.
   */
  @IsOptional()
  @IsUUID()
  vehicleTypeId?: string;

  /** Default true (active only) */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;
}

class VehicleDriversUtilityQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}

class VehicleClientsUtilityQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cityId?: number;

  @IsOptional()
  @IsString()
  search?: string;
}

class ClientsByMastersUtilityQueryDto {
  @IsUUID()
  vehicleTypeId: string;

  @IsOptional()
  @IsUUID()
  vehicleSizeId?: string;

  @IsOptional()
  @IsUUID()
  vehicleCapacityId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cityId?: number;

  @IsOptional()
  @IsString()
  search?: string;
}

class DriversByVehicleUtilityQueryDto {
  @IsUUID()
  vehicleId: string;

  @IsOptional()
  @IsString()
  search?: string;
}

/**
 * Lightweight lookup endpoints for admin forms (role creation, client tax, trip expenses).
 */
@Controller('utilities')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class UtilitiesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly taxRulesService: TaxRulesService,
    private readonly vendorCategoriesService: VendorCategoriesService,
    private readonly vendorsService: VendorsService,
    private readonly vendorRatesService: VendorRatesService,
    private readonly vehiclesService: VehiclesService,
    private readonly vehicleTypesService: VehicleTypesService,
    private readonly vehicleSizesService: VehicleSizesService,
    private readonly vehicleCapacitiesService: VehicleCapacitiesService,
    private readonly assignedVehiclesService: AssignedVehiclesService,
    private readonly clientRatesService: ClientRatesService,
  ) {}

  /**
   * Permission list for role create/edit checkboxes.
   * Accessible with VIEW_PERMISSION, CREATE_ROLE, or UPDATE_ROLE.
   */
  @Get('permissions')
  @RequirePermissions('VIEW_PERMISSION', 'CREATE_ROLE', 'UPDATE_ROLE')
  listPermissions(@Query() query: PermissionsUtilityQueryDto) {
    return this.rolesService.listPermissionsUtility(query.search);
  }

  /**
   * Sale tax / tax-rule options for client create & edit (`saleTaxTypeIds`).
   * Defaults to currently effective ACTIVE rules.
   */
  @Get('sale-tax-types')
  @RequirePermissions(
    'VIEW_CLIENT',
    'CREATE_CLIENT',
    'UPDATE_CLIENT',
    'VIEW_TAX_RULE',
  )
  listSaleTaxTypes(@Query() query: SaleTaxUtilityQueryDto) {
    return this.taxRulesService.listSaleTaxUtility({
      search: query.search,
      displayStatus: query.displayStatus ?? 'ACTIVE',
    });
  }

  /**
   * Vehicle masters — types dropdown (default active).
   * Check `measurement` to decide size vs capacity filter next.
   */
  @Get('vehicle-types')
  @RequirePermissions(
    'VIEW_TRIP',
    'CREATE_TRIP',
    'UPDATE_TRIP',
    'VIEW_VEHICLE',
    'VIEW_VEHICLE_TYPE',
    'CREATE_VEHICLE',
    'UPDATE_VEHICLE',
  )
  listVehicleTypes(@Query() query: VehicleMasterUtilityQueryDto) {
    return this.vehicleTypesService.listUtility({
      search: query.search,
      isActive: query.isActive,
    });
  }

  /**
   * Vehicle masters — sizes dropdown (default active).
   * Use when selected type measurement is SIZE.
   */
  @Get('vehicle-sizes')
  @RequirePermissions(
    'VIEW_TRIP',
    'CREATE_TRIP',
    'UPDATE_TRIP',
    'VIEW_VEHICLE',
    'VIEW_VEHICLE_SIZE',
    'CREATE_VEHICLE',
    'UPDATE_VEHICLE',
  )
  listVehicleSizes(@Query() query: VehicleMasterUtilityQueryDto) {
    return this.vehicleSizesService.listUtility({
      search: query.search,
      isActive: query.isActive,
    });
  }

  /**
   * Vehicle masters — capacities dropdown (default active).
   * Use when selected type measurement is CAPACITY.
   */
  @Get('vehicle-capacities')
  @RequirePermissions(
    'VIEW_TRIP',
    'CREATE_TRIP',
    'UPDATE_TRIP',
    'VIEW_VEHICLE',
    'VIEW_VEHICLE_CAPACITY',
    'CREATE_VEHICLE',
    'UPDATE_VEHICLE',
  )
  listVehicleCapacities(@Query() query: VehicleMasterUtilityQueryDto) {
    return this.vehicleCapacitiesService.listUtility({
      search: query.search,
      isActive: query.isActive,
    });
  }

  /**
   * Trip create — vehicles for dropdown (default ACTIVE).
   * Filter by type / size / capacity after master picks.
   */
  @Get('vehicles')
  @RequirePermissions(
    'VIEW_TRIP',
    'CREATE_TRIP',
    'UPDATE_TRIP',
    'VIEW_VEHICLE',
  )
  listVehicles(@Query() query: VehicleUtilityQueryDto) {
    return this.vehiclesService.listUtility({
      search: query.search,
      status: query.status,
      vehicleTypeId: query.vehicleTypeId,
      vehicleSizeId: query.vehicleSizeId,
      vehicleCapacityId: query.vehicleCapacityId,
    });
  }

  /**
   * Trip create — drivers ASSIGNED to a vehicle.
   * Prefer this for trip form: ?vehicleId=
   */
  @Get('drivers')
  @RequirePermissions(
    'VIEW_TRIP',
    'CREATE_TRIP',
    'UPDATE_TRIP',
    'VIEW_VEHICLE',
    'VIEW_DRIVER',
  )
  listDriversByVehicle(@Query() query: DriversByVehicleUtilityQueryDto) {
    return this.assignedVehiclesService.listDriversUtilityForVehicle(
      query.vehicleId,
      { search: query.search },
    );
  }

  /**
   * Trip create — ACTIVE clients with client-rates for type + size/capacity.
   * SIZE types require vehicleSizeId; CAPACITY types require vehicleCapacityId.
   */
  @Get('clients')
  @RequirePermissions(
    'VIEW_TRIP',
    'CREATE_TRIP',
    'UPDATE_TRIP',
    'VIEW_CLIENT',
    'VIEW_CLIENT_RATE',
  )
  listClientsByMasters(@Query() query: ClientsByMastersUtilityQueryDto) {
    return this.clientRatesService.listClientsUtilityByMasters({
      vehicleTypeId: query.vehicleTypeId,
      vehicleSizeId: query.vehicleSizeId,
      vehicleCapacityId: query.vehicleCapacityId,
      cityId: query.cityId,
      search: query.search,
    });
  }

  /**
   * Trip create step 2 — drivers ASSIGNED to the selected vehicle.
   */
  @Get('vehicles/:vehicleId/drivers')
  @RequirePermissions(
    'VIEW_TRIP',
    'CREATE_TRIP',
    'UPDATE_TRIP',
    'VIEW_VEHICLE',
    'VIEW_DRIVER',
  )
  listVehicleDrivers(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Query() query: VehicleDriversUtilityQueryDto,
  ) {
    return this.assignedVehiclesService.listDriversUtilityForVehicle(
      vehicleId,
      { search: query.search },
    );
  }

  /**
   * Trip create step 3 — ACTIVE clients with rates matching vehicle
   * type + size/capacity (optional city filter).
   */
  @Get('vehicles/:vehicleId/clients')
  @RequirePermissions(
    'VIEW_TRIP',
    'CREATE_TRIP',
    'UPDATE_TRIP',
    'VIEW_VEHICLE',
    'VIEW_CLIENT',
    'VIEW_CLIENT_RATE',
  )
  listVehicleClients(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Query() query: VehicleClientsUtilityQueryDto,
  ) {
    return this.clientRatesService.listClientsUtilityForVehicle(vehicleId, {
      cityId: query.cityId,
      search: query.search,
    });
  }

  /**
   * Trip expense chain step 1 — vendor categories for dropdown.
   */
  @Get('vendor-categories')
  @RequirePermissions(
    'VIEW_TRIP',
    'CREATE_TRIP',
    'UPDATE_TRIP',
    'VIEW_VENDOR',
    'CREATE_VENDOR',
    'UPDATE_VENDOR',
    'VIEW_VENDOR_RATE',
  )
  listVendorCategories(@Query() query: VendorCategoryUtilityQueryDto) {
    return this.vendorCategoriesService.listUtility(query.search);
  }

  /**
   * Trip expense chain step 2 — vendors filtered by category.
   */
  @Get('vendors')
  @RequirePermissions(
    'VIEW_TRIP',
    'CREATE_TRIP',
    'UPDATE_TRIP',
    'VIEW_VENDOR',
    'CREATE_VENDOR',
    'UPDATE_VENDOR',
    'VIEW_VENDOR_RATE',
  )
  listVendors(@Query() query: VendorUtilityQueryDto) {
    return this.vendorsService.listUtility({
      vendorCategoryId: query.vendorCategoryId,
      search: query.search,
      status: query.status,
    });
  }

  /**
   * Trip expense chain step 3 — products that have rates for this vendor.
   */
  @Get('vendors/:vendorId/products')
  @RequirePermissions(
    'VIEW_TRIP',
    'CREATE_TRIP',
    'UPDATE_TRIP',
    'VIEW_VENDOR',
    'CREATE_VENDOR',
    'UPDATE_VENDOR',
    'VIEW_VENDOR_RATE',
  )
  listVendorProducts(
    @Param('vendorId', ParseUUIDPipe) vendorId: string,
    @Query() query: VendorProductUtilityQueryDto,
  ) {
    return this.vendorRatesService.listProductsUtility(vendorId, query.search);
  }

  /**
   * Trip expense chain step 4 — rates for vendor + product (default ACTIVE).
   * Use `suggestedRate` to prefill the Rate field.
   */
  @Get('vendors/:vendorId/products/:productId/rates')
  @RequirePermissions(
    'VIEW_TRIP',
    'CREATE_TRIP',
    'UPDATE_TRIP',
    'VIEW_VENDOR',
    'CREATE_VENDOR',
    'UPDATE_VENDOR',
    'VIEW_VENDOR_RATE',
  )
  listVendorProductRates(
    @Param('vendorId', ParseUUIDPipe) vendorId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query() query: VendorRateUtilityQueryDto,
  ) {
    return this.vendorRatesService.listRatesUtility({
      vendorId,
      productId,
      cityId: query.cityId,
      status: query.status,
    });
  }
}
