import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import { DashboardQueryDto } from '../auth/dto/dashboard.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { DashboardService } from '../services/dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @RequirePermissions('VIEW_DASHBOARD')
  getDashboard(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getDashboard(query);
  }
}
