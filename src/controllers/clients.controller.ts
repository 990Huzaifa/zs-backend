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
  ChangeClientStatusDto,
  ClientListQueryDto,
  ClientLocationListQueryDto,
  CreateClientContactDto,
  CreateClientDto,
  CreateClientLocationDto,
  UpdateClientContactDto,
  UpdateClientDto,
  UpdateClientLocationDto,
  UploadClientDocumentDto,
} from '../auth/dto/client.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { ClientsService } from '../services/clients.service';

@Controller('clients')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @RequirePermissions('CREATE_CLIENT')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateClientDto,
  ) {
    return this.clientsService.create(dto, buildActivityContext(user, req));
  }

  @Get()
  @RequirePermissions('VIEW_CLIENT')
  findAll(@Query() query: ClientListQueryDto) {
    return this.clientsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_CLIENT')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_CLIENT')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clientsService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_CLIENT')
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeClientStatusDto,
  ) {
    return this.clientsService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  // ── Contacts ──

  @Get(':id/contacts')
  @RequirePermissions('VIEW_CLIENT')
  listContacts(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.listContacts(id);
  }

  @Get(':id/contacts/:contactId')
  @RequirePermissions('VIEW_CLIENT')
  findContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ) {
    return this.clientsService.findContact(id, contactId);
  }

  @Post(':id/contacts')
  @RequirePermissions('UPDATE_CLIENT')
  createContact(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateClientContactDto,
  ) {
    return this.clientsService.createContact(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Put(':id/contacts/:contactId')
  @RequirePermissions('UPDATE_CLIENT')
  updateContact(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body() dto: UpdateClientContactDto,
  ) {
    return this.clientsService.updateContact(
      id,
      contactId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id/contacts/:contactId')
  @RequirePermissions('UPDATE_CLIENT')
  removeContact(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ) {
    return this.clientsService.removeContact(
      id,
      contactId,
      buildActivityContext(user, req),
    );
  }

  // ── Pickup locations ──

  @Get(':id/pickup-locations')
  @RequirePermissions('VIEW_CLIENT')
  listPickupLocations(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ClientLocationListQueryDto,
  ) {
    return this.clientsService.listPickupLocations(id, query.status);
  }

  @Get(':id/pickup-locations/:locationId')
  @RequirePermissions('VIEW_CLIENT')
  findPickupLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ) {
    return this.clientsService.findPickupLocation(id, locationId);
  }

  @Post(':id/pickup-locations')
  @RequirePermissions('UPDATE_CLIENT')
  createPickupLocation(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateClientLocationDto,
  ) {
    return this.clientsService.createPickupLocation(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Put(':id/pickup-locations/:locationId')
  @RequirePermissions('UPDATE_CLIENT')
  updatePickupLocation(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: UpdateClientLocationDto,
  ) {
    return this.clientsService.updatePickupLocation(
      id,
      locationId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/pickup-locations/:locationId/status')
  @RequirePermissions('UPDATE_CLIENT')
  changePickupStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: ChangeClientStatusDto,
  ) {
    return this.clientsService.changePickupStatus(
      id,
      locationId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id/pickup-locations/:locationId')
  @RequirePermissions('UPDATE_CLIENT')
  removePickupLocation(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ) {
    return this.clientsService.removePickupLocation(
      id,
      locationId,
      buildActivityContext(user, req),
    );
  }

  // ── Dropoff locations ──

  @Get(':id/dropoff-locations')
  @RequirePermissions('VIEW_CLIENT')
  listDropoffLocations(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ClientLocationListQueryDto,
  ) {
    return this.clientsService.listDropoffLocations(id, query.status);
  }

  @Get(':id/dropoff-locations/:locationId')
  @RequirePermissions('VIEW_CLIENT')
  findDropoffLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ) {
    return this.clientsService.findDropoffLocation(id, locationId);
  }

  @Post(':id/dropoff-locations')
  @RequirePermissions('UPDATE_CLIENT')
  createDropoffLocation(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateClientLocationDto,
  ) {
    return this.clientsService.createDropoffLocation(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Put(':id/dropoff-locations/:locationId')
  @RequirePermissions('UPDATE_CLIENT')
  updateDropoffLocation(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: UpdateClientLocationDto,
  ) {
    return this.clientsService.updateDropoffLocation(
      id,
      locationId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/dropoff-locations/:locationId/status')
  @RequirePermissions('UPDATE_CLIENT')
  changeDropoffStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: ChangeClientStatusDto,
  ) {
    return this.clientsService.changeDropoffStatus(
      id,
      locationId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id/dropoff-locations/:locationId')
  @RequirePermissions('UPDATE_CLIENT')
  removeDropoffLocation(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ) {
    return this.clientsService.removeDropoffLocation(
      id,
      locationId,
      buildActivityContext(user, req),
    );
  }

  // ── Documents ──

  @Get(':id/documents')
  @RequirePermissions('VIEW_CLIENT')
  listDocuments(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.listDocuments(id);
  }

  @Post(':id/documents')
  @RequirePermissions('UPDATE_CLIENT')
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
    @Body() dto: UploadClientDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.clientsService.uploadDocument(
      id,
      dto,
      file,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id/documents/:documentId')
  @RequirePermissions('UPDATE_CLIENT')
  removeDocument(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.clientsService.removeDocument(
      id,
      documentId,
      buildActivityContext(user, req),
    );
  }
}
