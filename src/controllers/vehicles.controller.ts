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
  ChangeVehicleStatusDto,
  CreateVehicleDto,
  UpdateVehicleDto,
  UploadVehicleDocumentDto,
  VehicleListQueryDto,
} from '../auth/dto/vehicle.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { VehiclesService } from '../services/vehicles.service';

@Controller('vehicles')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Post()
  @RequirePermissions('CREATE_VEHICLE')
  create(@Body() dto: CreateVehicleDto) {
    return this.vehiclesService.create(dto);
  }

  @Get()
  @RequirePermissions('VIEW_VEHICLE')
  findAll(@Query() query: VehicleListQueryDto) {
    return this.vehiclesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_VEHICLE')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_VEHICLE')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.vehiclesService.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_VEHICLE')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeVehicleStatusDto,
  ) {
    return this.vehiclesService.changeStatus(id, dto);
  }

  @Get(':id/documents')
  @RequirePermissions('VIEW_VEHICLE')
  listDocuments(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.listDocuments(id);
  }

  @Post(':id/documents')
  @RequirePermissions('UPDATE_VEHICLE')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadVehicleDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.vehiclesService.uploadDocument(id, dto, file);
  }

  @Delete(':id/documents/:documentId')
  @RequirePermissions('UPDATE_VEHICLE')
  removeDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.vehiclesService.removeDocument(id, documentId);
  }
}
