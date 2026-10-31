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
  ClientBudgetListQueryDto,
  CreateClientBudgetDto,
  UpdateClientBudgetDto,
} from '../auth/dto/client-budget.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { ClientBudgetsService } from '../services/client-budgets.service';

@Controller('client-budgets')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ClientBudgetsController {
  constructor(private readonly clientBudgetsService: ClientBudgetsService) {}

  @Post()
  @RequirePermissions('CREATE_CLIENT_BUDGET')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateClientBudgetDto,
  ) {
    return this.clientBudgetsService.create(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_CLIENT_BUDGET')
  findAll(@Query() query: ClientBudgetListQueryDto) {
    return this.clientBudgetsService.findAll(query);
  }

  @Get('by-client/:clientId')
  @RequirePermissions('VIEW_CLIENT_BUDGET', 'VIEW_CLIENT')
  findByClient(@Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.clientBudgetsService.findByClient(clientId);
  }

  @Get(':id')
  @RequirePermissions('VIEW_CLIENT_BUDGET')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientBudgetsService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_CLIENT_BUDGET')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientBudgetDto,
  ) {
    return this.clientBudgetsService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_CLIENT_BUDGET')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.clientBudgetsService.remove(
      id,
      buildActivityContext(user, req),
    );
  }
}
