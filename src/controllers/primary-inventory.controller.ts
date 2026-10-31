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
  CreatePrimaryInventoryDto,
  PrimaryInventoryListQueryDto,
  UpdatePrimaryGatePassDto,
  UpdatePrimaryInventoryDto,
} from '../auth/dto/primary-inventory.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { PrimaryInventoryService } from '../services/primary-inventory.service';

@Controller('primary-inventory')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PrimaryInventoryController {
  constructor(
    private readonly primaryInventoryService: PrimaryInventoryService,
  ) {}

  @Post()
  @RequirePermissions('CREATE_PRIMARY_INVENTORY')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreatePrimaryInventoryDto,
  ) {
    return this.primaryInventoryService.create(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_PRIMARY_INVENTORY')
  findAll(@Query() query: PrimaryInventoryListQueryDto) {
    return this.primaryInventoryService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_PRIMARY_INVENTORY')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.primaryInventoryService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_PRIMARY_INVENTORY')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePrimaryInventoryDto,
  ) {
    return this.primaryInventoryService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  /** Update gate pass number only. */
  @Patch(':id/gate-pass')
  @RequirePermissions('UPDATE_PRIMARY_INVENTORY')
  updateGatePass(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePrimaryGatePassDto,
  ) {
    return this.primaryInventoryService.updateGatePass(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_PRIMARY_INVENTORY')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.primaryInventoryService.remove(
      id,
      buildActivityContext(user, req),
    );
  }
}
