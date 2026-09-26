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
  CreateShopDto,
  ShopListQueryDto,
  UpdateShopDto,
} from '../auth/dto/shop.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { ShopsService } from '../services/shops.service';

@Controller('shops')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  @Post()
  @RequirePermissions('CREATE_SHOP')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateShopDto,
  ) {
    return this.shopsService.create(dto, buildActivityContext(user, req));
  }

  @Get()
  @RequirePermissions('VIEW_SHOP')
  findAll(@Query() query: ShopListQueryDto) {
    return this.shopsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_SHOP')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.shopsService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_SHOP')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShopDto,
  ) {
    return this.shopsService.update(id, dto, buildActivityContext(user, req));
  }

  @Delete(':id')
  @RequirePermissions('DELETE_SHOP')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.shopsService.remove(id, buildActivityContext(user, req));
  }
}
