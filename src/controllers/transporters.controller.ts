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
  ChangeTransporterStatusDto,
  CreateTransporterContactDto,
  CreateTransporterDto,
  TransporterListQueryDto,
  UpdateTransporterContactDto,
  UpdateTransporterDto,
} from '../auth/dto/transporter.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { TransportersService } from '../services/transporters.service';

@Controller('transporters')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class TransportersController {
  constructor(private readonly transportersService: TransportersService) {}

  @Post()
  @RequirePermissions('CREATE_TRANSPORTER')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateTransporterDto,
  ) {
    return this.transportersService.create(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_TRANSPORTER')
  findAll(@Query() query: TransporterListQueryDto) {
    return this.transportersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_TRANSPORTER')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.transportersService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_TRANSPORTER')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransporterDto,
  ) {
    return this.transportersService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_TRANSPORTER')
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeTransporterStatusDto,
  ) {
    return this.transportersService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_TRANSPORTER')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.transportersService.remove(
      id,
      buildActivityContext(user, req),
    );
  }

  // ── Contacts ──

  @Get(':id/contacts')
  @RequirePermissions('VIEW_TRANSPORTER')
  listContacts(@Param('id', ParseUUIDPipe) id: string) {
    return this.transportersService.listContacts(id);
  }

  @Get(':id/contacts/:contactId')
  @RequirePermissions('VIEW_TRANSPORTER')
  findContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ) {
    return this.transportersService.findContact(id, contactId);
  }

  @Post(':id/contacts')
  @RequirePermissions('UPDATE_TRANSPORTER')
  createContact(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTransporterContactDto,
  ) {
    return this.transportersService.createContact(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Put(':id/contacts/:contactId')
  @RequirePermissions('UPDATE_TRANSPORTER')
  updateContact(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body() dto: UpdateTransporterContactDto,
  ) {
    return this.transportersService.updateContact(
      id,
      contactId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id/contacts/:contactId')
  @RequirePermissions('UPDATE_TRANSPORTER')
  removeContact(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ) {
    return this.transportersService.removeContact(
      id,
      contactId,
      buildActivityContext(user, req),
    );
  }
}
