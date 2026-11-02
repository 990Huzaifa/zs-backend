import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import {
  CheckSecondaryInvoiceQueryDto,
  CreateSecondaryInventoryDto,
  SecondaryInventoryListQueryDto,
} from '../auth/dto/secondary-inventory.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { SecondaryInventoryService } from '../services/secondary-inventory.service';

@Controller('secondary-inventory')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class SecondaryInventoryController {
  constructor(
    private readonly secondaryInventoryService: SecondaryInventoryService,
  ) {}

  @Post()
  @RequirePermissions('CREATE_SECONDARY_INVENTORY')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateSecondaryInventoryDto,
  ) {
    return this.secondaryInventoryService.create(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('LIST_SECONDARY_INVENTORY')
  findAll(@Query() query: SecondaryInventoryListQueryDto) {
    return this.secondaryInventoryService.findAll(query);
  }

  /** Check invoice uniqueness while typing. */
  @Get('check-invoice')
  @RequirePermissions(
    'CREATE_SECONDARY_INVENTORY',
    'LIST_SECONDARY_INVENTORY',
    'VIEW_SECONDARY_INVENTORY',
  )
  checkInvoice(@Query() query: CheckSecondaryInvoiceQueryDto) {
    return this.secondaryInventoryService.checkInvoice(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_SECONDARY_INVENTORY')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.secondaryInventoryService.findOne(id);
  }
}
