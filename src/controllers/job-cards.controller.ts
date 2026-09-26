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
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import {
  ChangeJobCardItemStatusDto,
  ChangeJobCardStatusDto,
  CreateJobCardDto,
  CreateJobCardItemDto,
  JobCardListQueryDto,
  ReplaceJobCardItemsDto,
  UpdateJobCardDto,
  UpdateJobCardItemDto,
} from '../auth/dto/job-card.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { JobCardsService } from '../services/job-cards.service';

@Controller('job-cards')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class JobCardsController {
  constructor(private readonly jobCardsService: JobCardsService) {}

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
