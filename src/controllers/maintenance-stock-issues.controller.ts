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
  ChangeMaintenanceStockIssueStatusDto,
  CreateMaintenanceStockIssueDto,
  MaintenanceStockIssueListQueryDto,
  ReplaceMaintenanceStockIssueItemsDto,
  UpdateMaintenanceStockIssueDto,
  UpdateMaintenanceStockIssueItemDto,
} from '../auth/dto/maintenance-stock-issue.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { MaintenanceStockIssuesService } from '../services/maintenance-stock-issues.service';

@Controller('maintenance-stock-issues')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class MaintenanceStockIssuesController {
  constructor(
    private readonly stockIssuesService: MaintenanceStockIssuesService,
  ) {}

  @Post()
  @RequirePermissions('CREATE_MAINTENANCE_STOCK_ISSUE')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateMaintenanceStockIssueDto,
  ) {
    return this.stockIssuesService.create(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_MAINTENANCE_STOCK_ISSUE')
  findAll(@Query() query: MaintenanceStockIssueListQueryDto) {
    return this.stockIssuesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_MAINTENANCE_STOCK_ISSUE')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.stockIssuesService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_MAINTENANCE_STOCK_ISSUE')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaintenanceStockIssueDto,
  ) {
    return this.stockIssuesService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/status')
  @RequirePermissions(
    'UPDATE_MAINTENANCE_STOCK_ISSUE',
    'APPROVE_MAINTENANCE_STOCK_ISSUE',
  )
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeMaintenanceStockIssueStatusDto,
  ) {
    return this.stockIssuesService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
      user.id,
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_MAINTENANCE_STOCK_ISSUE')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.stockIssuesService.remove(
      id,
      buildActivityContext(user, req),
    );
  }

  @Put(':id/items')
  @RequirePermissions('UPDATE_MAINTENANCE_STOCK_ISSUE')
  replaceItems(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceMaintenanceStockIssueItemsDto,
  ) {
    return this.stockIssuesService.replaceItems(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Put(':id/items/:itemId')
  @RequirePermissions('UPDATE_MAINTENANCE_STOCK_ISSUE')
  updateItem(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateMaintenanceStockIssueItemDto,
  ) {
    return this.stockIssuesService.updateItem(
      id,
      itemId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id/items/:itemId')
  @RequirePermissions('UPDATE_MAINTENANCE_STOCK_ISSUE')
  removeItem(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.stockIssuesService.removeItem(
      id,
      itemId,
      buildActivityContext(user, req),
    );
  }
}
