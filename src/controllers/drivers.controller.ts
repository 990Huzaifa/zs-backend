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
  ChangeDriverStatusDto,
  CreateDriverDto,
  DriverListQueryDto,
  UpdateDriverDto,
  UploadDriverDocumentDto,
} from '../auth/dto/driver.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { DriversService } from '../services/drivers.service';

@Controller('drivers')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Post()
  @RequirePermissions('CREATE_DRIVER')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateDriverDto,
  ) {
    return this.driversService.create(dto, buildActivityContext(user, req));
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
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDriverDto,
  ) {
    return this.driversService.update(id, dto, buildActivityContext(user, req));
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_DRIVER')
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeDriverStatusDto,
  ) {
    return this.driversService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Post(':id/avatar')
  @RequirePermissions('UPDATE_DRIVER')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadAvatar(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.driversService.uploadAvatar(
      id,
      file,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id/avatar')
  @RequirePermissions('UPDATE_DRIVER')
  removeAvatar(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.driversService.removeAvatar(
      id,
      buildActivityContext(user, req),
    );
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
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadDriverDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.driversService.uploadDocument(
      id,
      dto,
      file,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id/documents/:documentId')
  @RequirePermissions('UPDATE_DRIVER')
  removeDocument(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.driversService.removeDocument(
      id,
      documentId,
      buildActivityContext(user, req),
    );
  }
}
