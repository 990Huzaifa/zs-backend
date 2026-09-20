import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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
  CreateTransporterDto,
  TransporterListQueryDto,
  UpdateTransporterDto,
} from '../auth/dto/transporter.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { TransportersService } from '../services/transporters.service';

@Controller('transporters')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class TransportersController {
  constructor(private readonly transportersService: TransportersService) {}

  @Post()
  @RequirePermissions('CREATE_TRANSPORTER')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateTransporterDto,
  ) {
    return this.transportersService.create(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_TRANSPORTER')
  findAll(@Query() query: TransporterListQueryDto) {
    return this.transportersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_TRANSPORTER')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.transportersService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_TRANSPORTER')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransporterDto,
  ) {
    return this.transportersService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_TRANSPORTER')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.transportersService.remove(
      id,
      buildActivityContext(user, req),
    );
  }
}
