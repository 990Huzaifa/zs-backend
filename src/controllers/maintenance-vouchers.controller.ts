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
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import {
  ChangeMaintenanceVoucherStatusDto,
  CreateMaintenanceVoucherBatchDto,
  MaintenanceVoucherListQueryDto,
  RemoveMaintenanceVoucherProofImageDto,
  UpdateMaintenanceVoucherDto,
} from '../auth/dto/maintenance-voucher.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { MaintenanceVouchersService } from '../services/vouchers/maintenance.service';

@Controller('maintenance-vouchers')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class MaintenanceVouchersController {
  constructor(
    private readonly maintenanceVouchersService: MaintenanceVouchersService,
  ) {}

  @Post()
  @RequirePermissions('CREATE_MAINTENANCE_VOUCHER')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateMaintenanceVoucherBatchDto,
  ) {
    return this.maintenanceVouchersService.createBatch(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_MAINTENANCE_VOUCHER')
  findAll(@Query() query: MaintenanceVoucherListQueryDto) {
    return this.maintenanceVouchersService.findAll(query);
  }

  @Get(':id/qr')
  @RequirePermissions('VIEW_MAINTENANCE_VOUCHER')
  async downloadQr(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { buffer, filename } =
      await this.maintenanceVouchersService.getPublicQrPng(id);
    return new StreamableFile(buffer, {
      type: 'image/png',
      disposition: `inline; filename="${filename}"`,
    });
  }

  @Get(':id')
  @RequirePermissions('VIEW_MAINTENANCE_VOUCHER')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.maintenanceVouchersService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_MAINTENANCE_VOUCHER')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaintenanceVoucherDto,
  ) {
    return this.maintenanceVouchersService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_MAINTENANCE_VOUCHER')
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeMaintenanceVoucherStatusDto,
  ) {
    return this.maintenanceVouchersService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Post(':id/proof-images')
  @RequirePermissions('UPDATE_MAINTENANCE_VOUCHER')
  @UseInterceptors(
    FilesInterceptor('images', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadProofImages(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.maintenanceVouchersService.uploadProofImages(
      id,
      files,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id/proof-images')
  @RequirePermissions('UPDATE_MAINTENANCE_VOUCHER')
  removeProofImage(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RemoveMaintenanceVoucherProofImageDto,
  ) {
    return this.maintenanceVouchersService.removeProofImage(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_MAINTENANCE_VOUCHER')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.maintenanceVouchersService.remove(
      id,
      buildActivityContext(user, req),
    );
  }
}
