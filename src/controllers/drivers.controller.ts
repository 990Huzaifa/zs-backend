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
  ChangeDriverStatusDto,
  CreateDriverDto,
  DriverListQueryDto,
  UpdateDriverDto,
  UploadDriverDocumentDto,
} from '../auth/dto/driver.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { DriversService } from '../services/drivers.service';

@Controller('drivers')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Post()
  @RequirePermissions('CREATE_DRIVER')
  create(@Body() dto: CreateDriverDto) {
    return this.driversService.create(dto);
  }

  @Get()
  @RequirePermissions('VIEW_DRIVER')
  findAll(@Query() query: DriverListQueryDto) {
    return this.driversService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_DRIVER')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.driversService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_DRIVER')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDriverDto,
  ) {
    return this.driversService.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_DRIVER')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeDriverStatusDto,
  ) {
    return this.driversService.changeStatus(id, dto);
  }

  @Get(':id/documents')
  @RequirePermissions('VIEW_DRIVER')
  listDocuments(@Param('id', ParseUUIDPipe) id: string) {
    return this.driversService.listDocuments(id);
  }

  @Post(':id/documents')
  @RequirePermissions('UPDATE_DRIVER')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadDriverDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.driversService.uploadDocument(id, dto, file);
  }

  @Delete(':id/documents/:documentId')
  @RequirePermissions('UPDATE_DRIVER')
  removeDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.driversService.removeDocument(id, documentId);
  }
}
