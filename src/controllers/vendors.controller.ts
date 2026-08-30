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
  ChangeVendorStatusDto,
  CreateVendorContactDto,
  CreateVendorDto,
  UpdateVendorContactDto,
  UpdateVendorDto,
  VendorListQueryDto,
} from '../auth/dto/vendor.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { VendorsService } from '../services/vendors.service';

@Controller('vendors')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Post()
  @RequirePermissions('CREATE_VENDOR')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateVendorDto,
  ) {
    return this.vendorsService.create(dto, buildActivityContext(user, req));
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
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorDto,
  ) {
    return this.vendorsService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_VENDOR')
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeVendorStatusDto,
  ) {
    return this.vendorsService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  // ── Contacts ──

  @Get(':id/contacts')
  @RequirePermissions('VIEW_VENDOR')
  listContacts(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendorsService.listContacts(id);
  }

  @Get(':id/contacts/:contactId')
  @RequirePermissions('VIEW_VENDOR')
  findContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ) {
    return this.vendorsService.findContact(id, contactId);
  }

  @Post(':id/contacts')
  @RequirePermissions('UPDATE_VENDOR')
  createContact(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVendorContactDto,
  ) {
    return this.vendorsService.createContact(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Put(':id/contacts/:contactId')
  @RequirePermissions('UPDATE_VENDOR')
  updateContact(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body() dto: UpdateVendorContactDto,
  ) {
    return this.vendorsService.updateContact(
      id,
      contactId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id/contacts/:contactId')
  @RequirePermissions('UPDATE_VENDOR')
  removeContact(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ) {
    return this.vendorsService.removeContact(
      id,
      contactId,
      buildActivityContext(user, req),
    );
  }
}
