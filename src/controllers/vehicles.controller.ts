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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import {
  ChangeVehicleStatusDto,
  CreateVehicleDto,
  RemoveVehicleImageDto,
  UpdateVehicleDto,
  UploadVehicleDocumentDto,
  VehicleListQueryDto,
} from '../auth/dto/vehicle.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { VehiclesService } from '../services/vehicles.service';

@Controller('vehicles')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Post()
  @RequirePermissions('CREATE_VEHICLE')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateVehicleDto,
  ) {
    return this.vehiclesService.create(dto, buildActivityContext(user, req));
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
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.vehiclesService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_VEHICLE')
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeVehicleStatusDto,
  ) {
    return this.vehiclesService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Post(':id/images')
  @RequirePermissions('UPDATE_VEHICLE')
  @UseInterceptors(
    FilesInterceptor('images', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadImages(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.vehiclesService.uploadImages(
      id,
      files,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id/images')
  @RequirePermissions('UPDATE_VEHICLE')
  removeImage(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RemoveVehicleImageDto,
  ) {
    return this.vehiclesService.removeImage(
      id,
      dto,
      buildActivityContext(user, req),
    );
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
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadVehicleDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.vehiclesService.uploadDocument(
      id,
      dto,
      file,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id/documents/:documentId')
  @RequirePermissions('UPDATE_VEHICLE')
  removeDocument(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.vehiclesService.removeDocument(
      id,
      documentId,
      buildActivityContext(user, req),
    );
  }
}
