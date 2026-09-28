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
  CreateEmployeeDto,
  EmployeeListQueryDto,
  UpdateEmployeeDto,
} from '../auth/dto/hr.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { EmployeesService } from '../services/employees.service';

@Controller('employees')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @RequirePermissions('CREATE_EMPLOYEE')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.employeesService.create(dto, buildActivityContext(user, req));
  }

  @Get()
  @RequirePermissions('VIEW_EMPLOYEE')
  findAll(@Query() query: EmployeeListQueryDto) {
    return this.employeesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_EMPLOYEE')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeesService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_EMPLOYEE')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employeesService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_EMPLOYEE')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.employeesService.remove(id, buildActivityContext(user, req));
  }
}
