import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import { StockBalanceListQueryDto } from '../auth/dto/secondary-inventory.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { StockBalancesService } from '../services/stock-balances.service';

@Controller('stock-balances')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class StockBalancesController {
  constructor(private readonly stockBalancesService: StockBalancesService) {}

  @Get()
  @RequirePermissions('LIST_STOCK_BALANCE')
  findAll(@Query() query: StockBalanceListQueryDto) {
    return this.stockBalancesService.findAll(query);
  }
}
