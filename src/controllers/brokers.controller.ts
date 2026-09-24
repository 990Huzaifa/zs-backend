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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import {
  ChangeBrokerStatusDto,
  CreateBrokerContactDto,
  CreateBrokerDto,
  BrokerListQueryDto,
  UpdateBrokerContactDto,
  UpdateBrokerDto,
  UploadBrokerDocumentDto,
} from '../auth/dto/broker.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { BrokersService } from '../services/brokers.service';

@Controller('brokers')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class BrokersController {
  constructor(private readonly brokersService: BrokersService) {}

  @Post()
  @RequirePermissions('CREATE_BROKER')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateBrokerDto,
  ) {
    return this.brokersService.create(dto, buildActivityContext(user, req));
  }

  @Get()
  @RequirePermissions('VIEW_BROKER')
  findAll(@Query() query: BrokerListQueryDto) {
    return this.brokersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_BROKER')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.brokersService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_BROKER')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBrokerDto,
  ) {
    return this.brokersService.update(id, dto, buildActivityContext(user, req));
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_BROKER')
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeBrokerStatusDto,
  ) {
    return this.brokersService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_BROKER')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.brokersService.remove(id, buildActivityContext(user, req));
  }

  // ── Contacts ──

  @Get(':id/contacts')
  @RequirePermissions('VIEW_BROKER')
  listContacts(@Param('id', ParseUUIDPipe) id: string) {
    return this.brokersService.listContacts(id);
  }

  @Get(':id/contacts/:contactId')
  @RequirePermissions('VIEW_BROKER')
  findContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ) {
    return this.brokersService.findContact(id, contactId);
  }

  @Post(':id/contacts')
  @RequirePermissions('UPDATE_BROKER')
  createContact(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBrokerContactDto,
  ) {
    return this.brokersService.createContact(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Put(':id/contacts/:contactId')
  @RequirePermissions('UPDATE_BROKER')
  updateContact(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body() dto: UpdateBrokerContactDto,
  ) {
    return this.brokersService.updateContact(
      id,
      contactId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id/contacts/:contactId')
  @RequirePermissions('UPDATE_BROKER')
  removeContact(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ) {
    return this.brokersService.removeContact(
      id,
      contactId,
      buildActivityContext(user, req),
    );
  }

  // ── Documents ──

  @Get(':id/documents')
  @RequirePermissions('VIEW_BROKER')
  listDocuments(@Param('id', ParseUUIDPipe) id: string) {
    return this.brokersService.listDocuments(id);
  }

  @Post(':id/documents')
  @RequirePermissions('UPDATE_BROKER')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadDocument(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadBrokerDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.brokersService.uploadDocument(
      id,
      dto,
      file,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id/documents/:documentId')
  @RequirePermissions('UPDATE_BROKER')
  removeDocument(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.brokersService.removeDocument(
      id,
      documentId,
      buildActivityContext(user, req),
    );
  }
}
