import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import { InventoryLogListQueryDto } from '../auth/dto/stock-entry.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { InventoryLogsService } from '../services/inventory-logs.service';

@Controller('inventory-logs')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class InventoryLogsController {
  constructor(private readonly inventoryLogsService: InventoryLogsService) {}

  @Get()
  @RequirePermissions('LIST_INVENTORY_LOG')
  findAll(@Query() query: InventoryLogListQueryDto) {
    return this.inventoryLogsService.findAll(query);
  }
}
