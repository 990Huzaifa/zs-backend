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
  ChangeJobCardItemStatusDto,
  ChangeJobCardStatusDto,
  CreateJobCardDto,
  CreateJobCardItemDto,
  JobCardListQueryDto,
  RemoveJobCardFindingImageDto,
  ReplaceJobCardItemsDto,
  UpdateJobCardDto,
  UpdateJobCardItemDto,
} from '../auth/dto/job-card.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { JobCardsService } from '../services/job-cards.service';
import { JobCardPdfService } from '../services/pdf/jobcard-pdf.service';

@Controller('job-cards')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class JobCardsController {
  constructor(
    private readonly jobCardsService: JobCardsService,
    private readonly jobCardPdfService: JobCardPdfService,
  ) {}

  @Post()
  @RequirePermissions('CREATE_JOB_CARD')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateJobCardDto,
  ) {
    return this.jobCardsService.create(dto, buildActivityContext(user, req));
  }

  @Get()
  @RequirePermissions('VIEW_JOB_CARD')
  findAll(@Query() query: JobCardListQueryDto) {
    return this.jobCardsService.findAll(query);
  }

  @Get(':id/qr')
  @RequirePermissions('VIEW_JOB_CARD')
  async downloadQr(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { buffer, filename } =
      await this.jobCardsService.getPublicQrPng(id);
    return new StreamableFile(buffer, {
      type: 'image/png',
      disposition: `inline; filename="${filename}"`,
    });
  }

  @Get(':id/pdf')
  @RequirePermissions('VIEW_JOB_CARD')
  async downloadPdf(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.jobCardPdfService.generateById(id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get(':id')
  @RequirePermissions('VIEW_JOB_CARD')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobCardsService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_JOB_CARD')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobCardDto,
  ) {
    return this.jobCardsService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_JOB_CARD')
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeJobCardStatusDto,
  ) {
    return this.jobCardsService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_JOB_CARD')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.jobCardsService.remove(id, buildActivityContext(user, req));
  }

  // ── Items ──

  @Post(':id/items')
  @RequirePermissions('UPDATE_JOB_CARD')
  addItem(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateJobCardItemDto,
  ) {
    return this.jobCardsService.addItem(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Put(':id/items')
  @RequirePermissions('UPDATE_JOB_CARD')
  replaceItems(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceJobCardItemsDto,
  ) {
    return this.jobCardsService.replaceItems(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Put(':id/items/:itemId')
  @RequirePermissions('UPDATE_JOB_CARD')
  updateItem(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateJobCardItemDto,
  ) {
    return this.jobCardsService.updateItem(
      id,
      itemId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Post(':id/items/:itemId/images')
  @RequirePermissions('UPDATE_JOB_CARD')
  @UseInterceptors(
    FilesInterceptor('images', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadFindingImages(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.jobCardsService.uploadFindingImages(
      id,
      itemId,
      files,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id/items/:itemId/images')
  @RequirePermissions('UPDATE_JOB_CARD')
  removeFindingImage(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: RemoveJobCardFindingImageDto,
  ) {
    return this.jobCardsService.removeFindingImage(
      id,
      itemId,
      dto.key,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/items/:itemId/status')
  @RequirePermissions('UPDATE_JOB_CARD')
  changeItemStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: ChangeJobCardItemStatusDto,
  ) {
    return this.jobCardsService.changeItemStatus(
      id,
      itemId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id/items/:itemId')
  @RequirePermissions('UPDATE_JOB_CARD')
  removeItem(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.jobCardsService.removeItem(
      id,
      itemId,
      buildActivityContext(user, req),
    );
  }
}
