import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import { TransactionListQueryDto } from '../auth/dto/transaction.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { TransactionsService } from '../services/transactions.service';

@Controller('transactions')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @RequirePermissions('VIEW_TRANSACTION', 'VIEW_CHART_OF_ACCOUNT')
  findAll(@Query() query: TransactionListQueryDto) {
    return this.transactionsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_TRANSACTION', 'VIEW_CHART_OF_ACCOUNT')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.transactionsService.findOne(id);
  }
}
