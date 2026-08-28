import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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
  CreateVendorProductDto,
  UpdateVendorProductDto,
  VendorProductListQueryDto,
} from '../auth/dto/vendor-product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { VendorProductsService } from '../services/vendor-products.service';

@Controller('vendor-products')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class VendorProductsController {
  constructor(private readonly vendorProductsService: VendorProductsService) {}

  @Post()
  @RequirePermissions('CREATE_VENDOR_PRODUCT')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateVendorProductDto,
  ) {
    return this.vendorProductsService.create(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_VENDOR_PRODUCT')
  findAll(@Query() query: VendorProductListQueryDto) {
    return this.vendorProductsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_VENDOR_PRODUCT')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendorProductsService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_VENDOR_PRODUCT')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorProductDto,
  ) {
    return this.vendorProductsService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_VENDOR_PRODUCT')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.vendorProductsService.remove(
      id,
      buildActivityContext(user, req),
    );
  }
}
