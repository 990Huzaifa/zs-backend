import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import {
  DashboardQueryDto,
  RevenueOverviewQueryDto,
} from '../auth/dto/dashboard.dto';
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

  /**
   * Revenue Overview card — COA Income (level1 = 4) net activity.
   * Dropdown: This Month / Last Month.
   */
  @Get('revenue-overview')
  @RequirePermissions('VIEW_DASHBOARD')
  getRevenueOverview(@Query() query: RevenueOverviewQueryDto) {
    return this.dashboardService.getRevenueOverview(query);
  }

  /**
   * Document Expiry Alerts card — active DOCUMENT_EXPIRY alerts
   * with critical / warning / overdue breakdown.
   */
  @Get('document-expiry-alerts')
  @RequirePermissions('VIEW_DASHBOARD')
  getDocumentExpiryAlerts() {
    return this.dashboardService.getDocumentExpiryAlerts();
  }
}
