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
  ChangeGrnStatusDto,
  CreateGrnDto,
  GrnListQueryDto,
  ReplaceGrnItemsDto,
  UpdateGrnDto,
  UpdateGrnItemDto,
} from '../auth/dto/grn.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { GoodsReceiptNotesService } from '../services/goods-receipt-notes.service';

@Controller('goods-receipt-notes')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class GoodsReceiptNotesController {
  constructor(private readonly grnService: GoodsReceiptNotesService) {}

  @Post()
  @RequirePermissions('CREATE_GRN')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateGrnDto,
  ) {
    return this.grnService.create(dto, buildActivityContext(user, req));
  }

  @Get()
  @RequirePermissions('VIEW_GRN')
  findAll(@Query() query: GrnListQueryDto) {
    return this.grnService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_GRN')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.grnService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_GRN')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGrnDto,
  ) {
    return this.grnService.update(id, dto, buildActivityContext(user, req));
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_GRN', 'APPROVE_GRN')
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeGrnStatusDto,
  ) {
    return this.grnService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
      user.id,
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_GRN')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.grnService.remove(id, buildActivityContext(user, req));
  }

  @Put(':id/items')
  @RequirePermissions('UPDATE_GRN')
  replaceItems(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceGrnItemsDto,
  ) {
    return this.grnService.replaceItems(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Put(':id/items/:itemId')
  @RequirePermissions('UPDATE_GRN')
  updateItem(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateGrnItemDto,
  ) {
    return this.grnService.updateItem(
      id,
      itemId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id/items/:itemId')
  @RequirePermissions('UPDATE_GRN')
  removeItem(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.grnService.removeItem(
      id,
      itemId,
      buildActivityContext(user, req),
    );
  }
}
