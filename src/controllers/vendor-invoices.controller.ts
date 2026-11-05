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
  CreateVendorInvoiceDto,
  UpdateVendorInvoiceDto,
  VendorInvoiceListQueryDto,
} from '../auth/dto/vendor-invoice.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { VendorInvoicesService } from '../services/vendor-invoices.service';

@Controller('vendor-invoices')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class VendorInvoicesController {
  constructor(
    private readonly vendorInvoicesService: VendorInvoicesService,
  ) {}

  @Post()
  @RequirePermissions('CREATE_VENDOR_INVOICE')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateVendorInvoiceDto,
  ) {
    return this.vendorInvoicesService.create(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('LIST_VENDOR_INVOICE')
  findAll(@Query() query: VendorInvoiceListQueryDto) {
    return this.vendorInvoicesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_VENDOR_INVOICE')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendorInvoicesService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_VENDOR_INVOICE')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorInvoiceDto,
  ) {
    return this.vendorInvoicesService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/pay')
  @RequirePermissions('PAY_VENDOR_INVOICE')
  markPaid(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.vendorInvoicesService.markPaid(
      id,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/cancel')
  @RequirePermissions('CANCEL_VENDOR_INVOICE')
  cancel(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.vendorInvoicesService.cancel(
      id,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_VENDOR_INVOICE')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.vendorInvoicesService.remove(
      id,
      buildActivityContext(user, req),
    );
  }
}
