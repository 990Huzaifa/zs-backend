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
  ChangeTransportationProductStatusDto,
  CreateTransportationProductDto,
  TransportationProductListQueryDto,
  UpdateTransportationProductDto,
} from '../auth/dto/transportation-product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { TransportationProductsService } from '../services/transportation-products.service';

@Controller('transportation-products')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class TransportationProductsController {
  constructor(
    private readonly transportationProductsService: TransportationProductsService,
  ) {}

  @Post()
  @RequirePermissions('CREATE_TRANSPORTATION_PRODUCT')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateTransportationProductDto,
  ) {
    return this.transportationProductsService.create(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_TRANSPORTATION_PRODUCT')
  findAll(@Query() query: TransportationProductListQueryDto) {
    return this.transportationProductsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_TRANSPORTATION_PRODUCT')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.transportationProductsService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_TRANSPORTATION_PRODUCT')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransportationProductDto,
  ) {
    return this.transportationProductsService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_TRANSPORTATION_PRODUCT')
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeTransportationProductStatusDto,
  ) {
    return this.transportationProductsService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_TRANSPORTATION_PRODUCT')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.transportationProductsService.remove(
      id,
      buildActivityContext(user, req),
    );
  }
}
