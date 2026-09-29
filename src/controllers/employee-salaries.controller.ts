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
  CreateEmployeeSalaryDto,
  EmployeeSalaryListQueryDto,
  UpdateEmployeeSalaryDto,
} from '../auth/dto/hr.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { EmployeeSalariesService } from '../services/employee-salaries.service';

@Controller('employee-salaries')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class EmployeeSalariesController {
  constructor(
    private readonly employeeSalariesService: EmployeeSalariesService,
  ) {}

  @Post()
  @RequirePermissions('CREATE_EMPLOYEE_SALARY')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateEmployeeSalaryDto,
  ) {
    return this.employeeSalariesService.create(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_EMPLOYEE_SALARY')
  findAll(@Query() query: EmployeeSalaryListQueryDto) {
    return this.employeeSalariesService.findAll(query);
  }

  @Get('active/:employeeId')
  @RequirePermissions('VIEW_EMPLOYEE_SALARY')
  getActive(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query('asOf') asOf?: string,
  ) {
    return this.employeeSalariesService.getActiveForEmployee(employeeId, asOf);
  }

  @Get(':id')
  @RequirePermissions('VIEW_EMPLOYEE_SALARY')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeeSalariesService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_EMPLOYEE_SALARY')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeSalaryDto,
  ) {
    return this.employeeSalariesService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_EMPLOYEE_SALARY')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.employeeSalariesService.remove(
      id,
      buildActivityContext(user, req),
    );
  }
}
