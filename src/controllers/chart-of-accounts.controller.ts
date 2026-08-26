import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import { ChartOfAccountListQueryDto } from '../auth/dto/chart-of-account.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';

@Controller('chart-of-accounts')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ChartOfAccountsController {
  constructor(
    private readonly chartOfAccountsService: ChartOfAccountsService,
  ) {}

  @Get()
  @RequirePermissions('VIEW_CHART_OF_ACCOUNT')
  findAll(@Query() query: ChartOfAccountListQueryDto) {
    return this.chartOfAccountsService.findAll(query);
  }
}
