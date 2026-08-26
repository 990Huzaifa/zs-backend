import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import {
  CreateVendorCategoryDto,
  UpdateVendorCategoryDto,
} from '../auth/dto/vendor-category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { VendorCategoriesService } from '../services/vendor-categories.service';

@Controller('vendor-categories')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class VendorCategoriesController {
  constructor(
    private readonly vendorCategoriesService: VendorCategoriesService,
  ) {}

  @Post()
  @RequirePermissions('CREATE_VENDOR_CATEGORY')
  create(@Body() dto: CreateVendorCategoryDto) {
    return this.vendorCategoriesService.create(dto);
  }

  @Get()
  @RequirePermissions('VIEW_VENDOR_CATEGORY')
  findAll() {
    return this.vendorCategoriesService.findAll();
  }

  @Get(':id')
  @RequirePermissions('VIEW_VENDOR_CATEGORY')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendorCategoriesService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_VENDOR_CATEGORY')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorCategoryDto,
  ) {
    return this.vendorCategoriesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('DELETE_VENDOR_CATEGORY')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendorCategoriesService.remove(id);
  }
}
