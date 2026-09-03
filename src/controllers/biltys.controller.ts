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
  BiltyListQueryDto,
  ChangeBiltyStatusDto,
  CreateBiltyDto,
  UpdateBiltyDto,
} from '../auth/dto/bilty.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { BiltyPdfService } from '../services/bilty-pdf.service';
import { BiltysService } from '../services/biltys.service';

@Controller('biltys')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class BiltysController {
  constructor(
    private readonly biltysService: BiltysService,
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
