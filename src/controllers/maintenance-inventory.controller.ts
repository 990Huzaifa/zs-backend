import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import {
  AdjustMaintenanceStockDto,
  ChangeBatchStatusDto,
  MaintenanceBatchListQueryDto,
  MaintenanceStockListQueryDto,
  MaintenanceStockLogListQueryDto,
} from '../auth/dto/maintenance-inventory.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { MaintenanceInventoryService } from '../services/maintenance-inventory.service';

@Controller('maintenance-inventory')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class MaintenanceInventoryController {
  constructor(
    private readonly inventoryService: MaintenanceInventoryService,
  ) {}

  @Get('stocks')
  @RequirePermissions('VIEW_MAINTENANCE_INVENTORY')
  findAllStocks(@Query() query: MaintenanceStockListQueryDto) {
    return this.inventoryService.findAllStocks(query);
  }

  @Get('stocks/product/:productId')
  @RequirePermissions('VIEW_MAINTENANCE_INVENTORY')
  findStockByProduct(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.inventoryService.findStockByProduct(productId);
  }

  @Get('batches')
  @RequirePermissions('VIEW_MAINTENANCE_INVENTORY')
  findAllBatches(@Query() query: MaintenanceBatchListQueryDto) {
    return this.inventoryService.findAllBatches(query);
  }

  @Get('batches/:id')
  @RequirePermissions('VIEW_MAINTENANCE_INVENTORY')
  findBatch(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryService.findBatch(id);
  }

  @Patch('batches/:id/status')
  @RequirePermissions('ADJUST_MAINTENANCE_INVENTORY')
  changeBatchStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeBatchStatusDto,
  ) {
    return this.inventoryService.changeBatchStatus(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get('logs')
  @RequirePermissions('VIEW_MAINTENANCE_INVENTORY')
  findAllLogs(@Query() query: MaintenanceStockLogListQueryDto) {
    return this.inventoryService.findAllLogs(query);
  }

  @Post('adjust')
  @RequirePermissions('ADJUST_MAINTENANCE_INVENTORY')
  adjust(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: AdjustMaintenanceStockDto,
  ) {
    return this.inventoryService.adjustStock(
      dto,
      buildActivityContext(user, req),
      user.id,
    );
  }
}
