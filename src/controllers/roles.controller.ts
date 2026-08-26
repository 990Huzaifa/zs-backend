import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import {
  CreateRoleDto,
  RoleListQueryDto,
  UpdateRoleDto,
} from '../auth/dto/role.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RolesService } from '../services/roles.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('permissions')
  @RequirePermissions('VIEW_PERMISSION', 'CREATE_ROLE', 'UPDATE_ROLE')
  listPermissions(@Query('search') search?: string) {
    return this.rolesService.listPermissionsUtility(search);
  }

  @Post('roles')
  @RequirePermissions('CREATE_ROLE')
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Get('roles')
  @RequirePermissions('VIEW_ROLE')
  findAll(@Query() query: RoleListQueryDto) {
    return this.rolesService.findAll(query);
  }

  @Get('roles/:id')
  @RequirePermissions('VIEW_ROLE')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.findOne(id);
  }

  @Put('roles/:id')
  @RequirePermissions('UPDATE_ROLE')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rolesService.update(id, dto);
  }
}
