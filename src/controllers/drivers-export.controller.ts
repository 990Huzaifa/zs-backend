import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import { CreateDriverExportDto } from '../auth/dto/driver-export.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { ExportEntityType } from '../database/entities/export-job.entity';
import { User } from '../database/entities/user.entity';
import { ExportJobsService } from '../services/export-jobs.service';

@Controller('drivers/export')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class DriversExportController {
  constructor(private readonly exportJobsService: ExportJobsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('EXPORT_DRIVER')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateDriverExportDto,
  ) {
    return this.exportJobsService.createJob(
      ExportEntityType.DRIVER,
      user,
      {
        format: dto.format,
        mode: dto.mode,
        recordIds: dto.driverIds,
        filters: dto.filters,
      },
      buildActivityContext(user, req),
    );
  }

  @Get(':jobId/download')
  @RequirePermissions('EXPORT_DRIVER')
  async download(
    @CurrentUser() user: User,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Promise<StreamableFile> {
    const { buffer, fileName, contentType } =
      await this.exportJobsService.downloadJob(
        ExportEntityType.DRIVER,
        user,
        jobId,
      );
    return new StreamableFile(buffer, {
      type: contentType,
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  @Get(':jobId')
  @RequirePermissions('EXPORT_DRIVER')
  getJob(
    @CurrentUser() user: User,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    return this.exportJobsService.getJob(
      ExportEntityType.DRIVER,
      user,
      jobId,
    );
  }
}
