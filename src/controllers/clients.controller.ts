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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
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
import { ClientsService } from '../services/clients.service';

@Controller('clients')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @RequirePermissions('CREATE_CLIENT')
  create(@Body() dto: CreateClientDto) {
    return this.clientsService.create(dto);
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
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clientsService.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_CLIENT')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeClientStatusDto,
  ) {
    return this.clientsService.changeStatus(id, dto);
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
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateClientContactDto,
  ) {
    return this.clientsService.createContact(id, dto);
  }

  @Put(':id/contacts/:contactId')
  @RequirePermissions('UPDATE_CLIENT')
  updateContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body() dto: UpdateClientContactDto,
  ) {
    return this.clientsService.updateContact(id, contactId, dto);
  }

  @Delete(':id/contacts/:contactId')
  @RequirePermissions('UPDATE_CLIENT')
  removeContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ) {
    return this.clientsService.removeContact(id, contactId);
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
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateClientLocationDto,
  ) {
    return this.clientsService.createPickupLocation(id, dto);
  }

  @Put(':id/pickup-locations/:locationId')
  @RequirePermissions('UPDATE_CLIENT')
  updatePickupLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: UpdateClientLocationDto,
  ) {
    return this.clientsService.updatePickupLocation(id, locationId, dto);
  }

  @Patch(':id/pickup-locations/:locationId/status')
  @RequirePermissions('UPDATE_CLIENT')
  changePickupStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: ChangeClientStatusDto,
  ) {
    return this.clientsService.changePickupStatus(id, locationId, dto);
  }

  @Delete(':id/pickup-locations/:locationId')
  @RequirePermissions('UPDATE_CLIENT')
  removePickupLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ) {
    return this.clientsService.removePickupLocation(id, locationId);
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
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateClientLocationDto,
  ) {
    return this.clientsService.createDropoffLocation(id, dto);
  }

  @Put(':id/dropoff-locations/:locationId')
  @RequirePermissions('UPDATE_CLIENT')
  updateDropoffLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: UpdateClientLocationDto,
  ) {
    return this.clientsService.updateDropoffLocation(id, locationId, dto);
  }

  @Patch(':id/dropoff-locations/:locationId/status')
  @RequirePermissions('UPDATE_CLIENT')
  changeDropoffStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: ChangeClientStatusDto,
  ) {
    return this.clientsService.changeDropoffStatus(id, locationId, dto);
  }

  @Delete(':id/dropoff-locations/:locationId')
  @RequirePermissions('UPDATE_CLIENT')
  removeDropoffLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ) {
    return this.clientsService.removeDropoffLocation(id, locationId);
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
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadClientDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.clientsService.uploadDocument(id, dto, file);
  }

  @Delete(':id/documents/:documentId')
  @RequirePermissions('UPDATE_CLIENT')
  removeDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.clientsService.removeDocument(id, documentId);
  }
}
