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
  CheckStockEntryInvoiceQueryDto,
  CreateStockEntryDto,
} from '../auth/dto/stock-entry.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { StockEntriesService } from '../services/stock-entries.service';

@Controller('stock-entries')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class StockEntriesController {
  constructor(private readonly stockEntriesService: StockEntriesService) {}

  @Post()
  @RequirePermissions('CREATE_STOCK_ENTRY')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateStockEntryDto,
  ) {
    return this.stockEntriesService.create(
      dto,
      buildActivityContext(user, req),
    );
  }

  /** Check invoice uniqueness while typing. */
  @Get('check-invoice')
  @RequirePermissions('CREATE_STOCK_ENTRY', 'LIST_INVENTORY_LOG')
  checkInvoice(@Query() query: CheckStockEntryInvoiceQueryDto) {
    return this.stockEntriesService.checkInvoice(query);
  }
}
