import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
  ChangePurchaseOrderStatusDto,
  CreatePurchaseOrderFromQuotationDto,
  CreatePurchaseOrderItemDto,
  PurchaseOrderListQueryDto,
  ReplacePurchaseOrderItemsDto,
  UpdatePurchaseOrderDto,
  UpdatePurchaseOrderItemDto,
} from '../auth/dto/purchase-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { PurchaseOrdersService } from '../services/purchase-orders.service';

@Controller('purchase-orders')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Post()
  @RequirePermissions('CREATE_PURCHASE_ORDER')
  createFromQuotation(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreatePurchaseOrderFromQuotationDto,
  ) {
    return this.purchaseOrdersService.createFromQuotation(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_PURCHASE_ORDER')
  findAll(@Query() query: PurchaseOrderListQueryDto) {
    return this.purchaseOrdersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_PURCHASE_ORDER')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchaseOrdersService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_PURCHASE_ORDER')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseOrderDto,
  ) {
    return this.purchaseOrdersService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_PURCHASE_ORDER', 'APPROVE_PURCHASE_ORDER')
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangePurchaseOrderStatusDto,
  ) {
    return this.purchaseOrdersService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
      user.id,
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_PURCHASE_ORDER')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.purchaseOrdersService.remove(
      id,
      buildActivityContext(user, req),
    );
  }

  // ── Items ──

  @Post(':id/items')
  @RequirePermissions('UPDATE_PURCHASE_ORDER')
  addItem(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePurchaseOrderItemDto,
  ) {
    return this.purchaseOrdersService.addItem(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Put(':id/items')
  @RequirePermissions('UPDATE_PURCHASE_ORDER')
  replaceItems(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplacePurchaseOrderItemsDto,
  ) {
    return this.purchaseOrdersService.replaceItems(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Put(':id/items/:itemId')
  @RequirePermissions('UPDATE_PURCHASE_ORDER')
  updateItem(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdatePurchaseOrderItemDto,
  ) {
    return this.purchaseOrdersService.updateItem(
      id,
      itemId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id/items/:itemId')
  @RequirePermissions('UPDATE_PURCHASE_ORDER')
  removeItem(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.purchaseOrdersService.removeItem(
      id,
      itemId,
      buildActivityContext(user, req),
    );
  }
}
