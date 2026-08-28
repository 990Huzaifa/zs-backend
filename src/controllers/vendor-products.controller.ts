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
  UseGuards,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import {
  CreateVendorProductDto,
  UpdateVendorProductDto,
  VendorProductListQueryDto,
} from '../auth/dto/vendor-product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { VendorProductsService } from '../services/vendor-products.service';

@Controller('vendor-products')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class VendorProductsController {
  constructor(private readonly vendorProductsService: VendorProductsService) {}

  @Post()
  @RequirePermissions('CREATE_VENDOR_PRODUCT')
  create(@Body() dto: CreateVendorProductDto) {
    return this.vendorProductsService.create(dto);
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
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorProductDto,
  ) {
    return this.vendorProductsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('DELETE_VENDOR_PRODUCT')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendorProductsService.remove(id);
  }
}
