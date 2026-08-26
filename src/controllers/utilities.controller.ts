import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RolesService } from '../services/roles.service';

class PermissionsUtilityQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}

/**
 * Lightweight lookup endpoints for admin forms (role creation, etc.).
 */
@Controller('utilities')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class UtilitiesController {
  constructor(private readonly rolesService: RolesService) {}

  /**
   * Permission list for role create/edit checkboxes.
   * Accessible with VIEW_PERMISSION, CREATE_ROLE, or UPDATE_ROLE.
   */
  @Get('permissions')
  @RequirePermissions('VIEW_PERMISSION', 'CREATE_ROLE', 'UPDATE_ROLE')
  listPermissions(@Query() query: PermissionsUtilityQueryDto) {
    return this.rolesService.listPermissionsUtility(query.search);
  }
}
