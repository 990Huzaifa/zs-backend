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
  ChangePurchaseQuotationStatusDto,
  CreatePurchaseQuotationDto,
  CreatePurchaseQuotationItemDto,
  PurchaseQuotationListQueryDto,
  ReplacePurchaseQuotationItemsDto,
  UpdatePurchaseQuotationDto,
  UpdatePurchaseQuotationItemDto,
} from '../auth/dto/purchase-quotation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { PurchaseQuotationsService } from '../services/purchase-quotations.service';

@Controller('purchase-quotations')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PurchaseQuotationsController {
  constructor(
    private readonly purchaseQuotationsService: PurchaseQuotationsService,
  ) {}

  @Post()
  @RequirePermissions('CREATE_PURCHASE_QUOTATION')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreatePurchaseQuotationDto,
  ) {
    return this.purchaseQuotationsService.create(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_PURCHASE_QUOTATION')
  findAll(@Query() query: PurchaseQuotationListQueryDto) {
    return this.purchaseQuotationsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_PURCHASE_QUOTATION')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchaseQuotationsService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_PURCHASE_QUOTATION')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseQuotationDto,
  ) {
    return this.purchaseQuotationsService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_PURCHASE_QUOTATION', 'APPROVE_PURCHASE_QUOTATION')
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangePurchaseQuotationStatusDto,
  ) {
    return this.purchaseQuotationsService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_PURCHASE_QUOTATION')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.purchaseQuotationsService.remove(
      id,
      buildActivityContext(user, req),
    );
  }

  // ── Items ──

  @Post(':id/items')
  @RequirePermissions('UPDATE_PURCHASE_QUOTATION')
  addItem(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePurchaseQuotationItemDto,
  ) {
    return this.purchaseQuotationsService.addItem(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Put(':id/items')
  @RequirePermissions('UPDATE_PURCHASE_QUOTATION')
  replaceItems(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplacePurchaseQuotationItemsDto,
  ) {
    return this.purchaseQuotationsService.replaceItems(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Put(':id/items/:itemId')
  @RequirePermissions('UPDATE_PURCHASE_QUOTATION')
  updateItem(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdatePurchaseQuotationItemDto,
  ) {
    return this.purchaseQuotationsService.updateItem(
      id,
      itemId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id/items/:itemId')
  @RequirePermissions('UPDATE_PURCHASE_QUOTATION')
  removeItem(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.purchaseQuotationsService.removeItem(
      id,
      itemId,
      buildActivityContext(user, req),
    );
  }
}
