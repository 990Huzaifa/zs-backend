import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import {
  CreateVendorCategoryDto,
  UpdateVendorCategoryDto,
} from '../auth/dto/vendor-category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { VendorCategoriesService } from '../services/vendor-categories.service';

@Controller('vendor-categories')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class VendorCategoriesController {
  constructor(
    private readonly vendorCategoriesService: VendorCategoriesService,
  ) {}

  @Post()
  @RequirePermissions('CREATE_VENDOR_CATEGORY')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateVendorCategoryDto,
  ) {
    return this.vendorCategoriesService.create(
      dto,
      buildActivityContext(user, req),
    );
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
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorCategoryDto,
  ) {
    return this.vendorCategoriesService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_VENDOR_CATEGORY')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.vendorCategoriesService.remove(
      id,
      buildActivityContext(user, req),
    );
  }
}
