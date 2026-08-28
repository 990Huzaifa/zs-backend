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
  ChangeVendorRateStatusDto,
  CreateVendorRateDto,
  UpdateVendorRateDto,
  VendorRateListQueryDto,
} from '../auth/dto/vendor-rate.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { VendorRatesService } from '../services/vendor-rates.service';

@Controller('vendor-rates')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class VendorRatesController {
  constructor(private readonly vendorRatesService: VendorRatesService) {}

  @Post()
  @RequirePermissions('CREATE_VENDOR_RATE')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateVendorRateDto,
  ) {
    return this.vendorRatesService.create(dto, buildActivityContext(user, req));
  }

  @Get()
  @RequirePermissions('VIEW_VENDOR_RATE')
  findAll(@Query() query: VendorRateListQueryDto) {
    return this.vendorRatesService.findAll(query);
  }

  @Get(':id/logs')
  @RequirePermissions('VIEW_VENDOR_RATE')
  findLogs(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendorRatesService.findLogs(id);
  }

  @Get(':id')
  @RequirePermissions('VIEW_VENDOR_RATE')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendorRatesService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_VENDOR_RATE')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorRateDto,
  ) {
    return this.vendorRatesService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_VENDOR_RATE')
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeVendorRateStatusDto,
  ) {
    return this.vendorRatesService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_VENDOR_RATE')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.vendorRatesService.remove(id, buildActivityContext(user, req));
  }
}
