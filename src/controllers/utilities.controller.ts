import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import { TaxRuleDisplayStatus } from '../auth/dto/tax-rule.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RolesService } from '../services/roles.service';
import { TaxRulesService } from '../services/tax-rules.service';

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
  displayStatus?: TaxRuleDisplayStatus;
}

/**
 * Lightweight lookup endpoints for admin forms (role creation, client tax, etc.).
 */
@Controller('utilities')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class UtilitiesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly taxRulesService: TaxRulesService,
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
}
