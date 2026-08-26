import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import {
  ChangeVendorStatusDto,
  CreateVendorDto,
  UpdateVendorDto,
  VendorListQueryDto,
} from '../auth/dto/vendor.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { VendorsService } from '../services/vendors.service';

@Controller('vendors')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Post()
  @RequirePermissions('CREATE_VENDOR')
  create(@Body() dto: CreateVendorDto) {
    return this.vendorsService.create(dto);
  }

  @Get()
  @RequirePermissions('VIEW_VENDOR')
  findAll(@Query() query: VendorListQueryDto) {
    return this.vendorsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_VENDOR')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendorsService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_VENDOR')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorDto,
  ) {
    return this.vendorsService.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_VENDOR')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeVendorStatusDto,
  ) {
    return this.vendorsService.changeStatus(id, dto);
  }
}
