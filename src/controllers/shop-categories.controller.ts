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
  CreateShopCategoryDto,
  ShopCategoryListQueryDto,
  UpdateShopCategoryDto,
} from '../auth/dto/shop-category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { ShopCategoriesService } from '../services/shop-categories.service';

@Controller('shop-categories')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ShopCategoriesController {
  constructor(private readonly shopCategoriesService: ShopCategoriesService) {}

  @Post()
  @RequirePermissions('CREATE_SHOP_CATEGORY')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateShopCategoryDto,
  ) {
    return this.shopCategoriesService.create(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_SHOP_CATEGORY')
  findAll(@Query() query: ShopCategoryListQueryDto) {
    return this.shopCategoriesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_SHOP_CATEGORY')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.shopCategoriesService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_SHOP_CATEGORY')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShopCategoryDto,
  ) {
    return this.shopCategoriesService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_SHOP_CATEGORY')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.shopCategoriesService.remove(
      id,
      buildActivityContext(user, req),
    );
  }
}
