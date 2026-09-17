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
  ChangeVendorVoucherStatusDto,
  CreateVendorVoucherBatchDto,
  UpdateVendorVoucherDto,
  VendorVoucherListQueryDto,
} from '../auth/dto/vendor-voucher.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { VendorVouchersService } from '../services/vouchers/vendor.service';

@Controller('vendor-vouchers')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class VendorVouchersController {
  constructor(
    private readonly vendorVouchersService: VendorVouchersService,
  ) {}

  @Post()
  @RequirePermissions('CREATE_VENDOR_VOUCHER')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateVendorVoucherBatchDto,
  ) {
    return this.vendorVouchersService.createBatch(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_VENDOR_VOUCHER')
  findAll(@Query() query: VendorVoucherListQueryDto) {
    return this.vendorVouchersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_VENDOR_VOUCHER')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendorVouchersService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_VENDOR_VOUCHER')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorVoucherDto,
  ) {
    return this.vendorVouchersService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_VENDOR_VOUCHER')
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeVendorVoucherStatusDto,
  ) {
    return this.vendorVouchersService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_VENDOR_VOUCHER')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.vendorVouchersService.remove(
      id,
      buildActivityContext(user, req),
    );
  }
}
