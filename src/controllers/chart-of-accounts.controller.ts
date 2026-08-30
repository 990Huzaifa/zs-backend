import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import {
  ChartOfAccountListQueryDto,
  CreateAssetAccountDto,
} from '../auth/dto/chart-of-account.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
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

  /**
   * Form helper: after choosing "Asset account", pick Cash or Bank.
   */
  @Get('asset-types')
  @RequirePermissions('VIEW_CHART_OF_ACCOUNT', 'CREATE_CHART_OF_ACCOUNT')
  listAssetTypes() {
    return this.chartOfAccountsService.listAssetTypes();
  }

  /**
   * Create Cash / Bank leaf under Assets.
   * Optional openingBalance → OPENING_BALANCE transaction (debit).
   */
  @Post('asset')
  @RequirePermissions('CREATE_CHART_OF_ACCOUNT')
  createAsset(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateAssetAccountDto,
  ) {
    return this.chartOfAccountsService.createAssetAccount(
      dto,
      buildActivityContext(user, req),
    );
  }
}
