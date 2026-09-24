import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import {
  CreateDepartmentDto,
  HrListQueryDto,
  UpdateDepartmentDto,
} from '../auth/dto/hr.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { DepartmentsService } from '../services/departments.service';

@Controller('departments')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Post()
  @RequirePermissions('CREATE_DEPARTMENT')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateDepartmentDto,
  ) {
    return this.departmentsService.create(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_DEPARTMENT')
  findAll(@Query() query: HrListQueryDto) {
    return this.departmentsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_DEPARTMENT')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.departmentsService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_DEPARTMENT')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.departmentsService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_DEPARTMENT')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.departmentsService.remove(
      id,
      buildActivityContext(user, req),
    );
  }
}
