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
  BiltyFreightListQueryDto,
  ChangeBiltyFreightStatusDto,
  CreateBiltyFreightBodyDto,
  RemoveBiltyFreightProofImageDto,
  UpdateBiltyFreightDto,
} from '../auth/dto/bilty-freight.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { BiltyFreightsService } from '../services/bilty-freights.service';

@Controller('bilty-freights')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class BiltyFreightsController {
  constructor(private readonly biltyFreightsService: BiltyFreightsService) {}

  @Post()
  @RequirePermissions('CREATE_BILTY_FREIGHT', 'UPDATE_BILTY', 'CREATE_BILTY')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateBiltyFreightBodyDto,
  ) {
    const { biltyId, ...rest } = dto;
    return this.biltyFreightsService.create(
      biltyId,
      rest,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_BILTY_FREIGHT', 'VIEW_BILTY')
  findAll(@Query() query: BiltyFreightListQueryDto) {
    return this.biltyFreightsService.findAll(query);
  }

  @Get(':id/qr')
  @RequirePermissions('VIEW_BILTY_FREIGHT', 'VIEW_BILTY')
  async downloadQr(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { buffer, filename } =
      await this.biltyFreightsService.getPublicQrPng(id);
    return new StreamableFile(buffer, {
      type: 'image/png',
      disposition: `inline; filename="${filename}"`,
    });
  }

  @Get(':id')
  @RequirePermissions('VIEW_BILTY_FREIGHT', 'VIEW_BILTY')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.biltyFreightsService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_BILTY_FREIGHT', 'UPDATE_BILTY')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBiltyFreightDto,
  ) {
    return this.biltyFreightsService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_BILTY_FREIGHT', 'UPDATE_BILTY')
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeBiltyFreightStatusDto,
  ) {
    return this.biltyFreightsService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Post(':id/proof-images')
  @RequirePermissions('UPDATE_BILTY_FREIGHT', 'UPDATE_BILTY')
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
    return this.biltyFreightsService.uploadProofImages(
      id,
      files,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id/proof-images')
  @RequirePermissions('UPDATE_BILTY_FREIGHT', 'UPDATE_BILTY')
  removeProofImage(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RemoveBiltyFreightProofImageDto,
  ) {
    return this.biltyFreightsService.removeProofImage(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_BILTY_FREIGHT', 'DELETE_BILTY', 'UPDATE_BILTY')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.biltyFreightsService.remove(
      id,
      buildActivityContext(user, req),
    );
  }
}
