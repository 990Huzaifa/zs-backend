import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import {
  BiltyFreightListQueryDto,
  BiltyListQueryDto,
  ChangeBiltyFreightStatusDto,
  ChangeBiltyStatusDto,
  CreateBiltyDto,
  CreateBiltyFreightDto,
  UpdateBiltyDto,
  UpdateBiltyFreightDto,
} from '../auth/dto/bilty.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { BiltyFreightsService } from '../services/bilty-freights.service';
import { BiltyPdfService } from '../services/pdf/bilty-pdf.service';
import { BiltysService } from '../services/biltys.service';

@Controller('biltys')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class BiltysController {
  constructor(
    private readonly biltysService: BiltysService,
    private readonly biltyFreightsService: BiltyFreightsService,
    private readonly biltyPdfService: BiltyPdfService,
  ) {}

  @Post()
  @RequirePermissions('CREATE_BILTY')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateBiltyDto,
  ) {
    return this.biltysService.create(
      dto,
      user.id,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_BILTY')
  findAll(@Query() query: BiltyListQueryDto) {
    return this.biltysService.findAll(query);
  }

  @Get(':id/pdf')
  @RequirePermissions('VIEW_BILTY')
  async downloadPdf(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.biltyPdfService.generateById(id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  // --- Bilty freights (broker settlement vouchers) ---

  @Post(':id/freights')
  @RequirePermissions('UPDATE_BILTY')
  createFreight(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBiltyFreightDto,
  ) {
    return this.biltyFreightsService.create(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get(':id/freights')
  @RequirePermissions('VIEW_BILTY')
  listFreights(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: BiltyFreightListQueryDto,
  ) {
    return this.biltyFreightsService.findAll(id, query);
  }

  @Get(':id/freights/:freightId')
  @RequirePermissions('VIEW_BILTY')
  getFreight(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('freightId', ParseUUIDPipe) freightId: string,
  ) {
    return this.biltyFreightsService.findOne(id, freightId);
  }

  @Put(':id/freights/:freightId')
  @RequirePermissions('UPDATE_BILTY')
  updateFreight(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('freightId', ParseUUIDPipe) freightId: string,
    @Body() dto: UpdateBiltyFreightDto,
  ) {
    return this.biltyFreightsService.update(
      id,
      freightId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/freights/:freightId/status')
  @RequirePermissions('UPDATE_BILTY')
  changeFreightStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('freightId', ParseUUIDPipe) freightId: string,
    @Body() dto: ChangeBiltyFreightStatusDto,
  ) {
    return this.biltyFreightsService.changeStatus(
      id,
      freightId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_BILTY')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.biltysService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_BILTY')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBiltyDto,
  ) {
    return this.biltysService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_BILTY')
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeBiltyStatusDto,
  ) {
    return this.biltysService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }
}
