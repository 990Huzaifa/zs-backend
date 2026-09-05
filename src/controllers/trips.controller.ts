import {
  BadRequestException,
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
  ChangeTripDocStatusDto,
  ChangeTripExpenseStatusDto,
  ChangeTripLoadStatusDto,
  ChangeTripStatusDto,
  CreateTripDto,
  CreateTripLoadDto,
  TripListQueryDto,
  UpdateTripAssetExpenseDto,
  UpdateTripDto,
  UpdateTripFuelExpenseDto,
  UpdateTripLoadDto,
  UpdateTripOfficeExpenseDto,
  UpdateTripPumpExpenseDto,
} from '../auth/dto/trip.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { TripsService } from '../services/trips.service';

const EXPENSE_KINDS = ['office', 'pump', 'fuel', 'mtag', 'other'] as const;
type ExpenseKind = (typeof EXPENSE_KINDS)[number];

@Controller('trips')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Post()
  @RequirePermissions('CREATE_TRIP')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateTripDto,
  ) {
    return this.tripsService.create(dto, buildActivityContext(user, req));
  }

  @Get()
  @RequirePermissions('VIEW_TRIP')
  findAll(@Query() query: TripListQueryDto) {
    return this.tripsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_TRIP')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.tripsService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_TRIP')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTripDto,
  ) {
    return this.tripsService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_TRIP')
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeTripStatusDto,
  ) {
    return this.tripsService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/doc-status')
  @RequirePermissions('UPDATE_TRIP')
  changeDocStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeTripDocStatusDto,
  ) {
    return this.tripsService.changeDocStatus(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Post(':id/upcountry-loads')
  @RequirePermissions('UPDATE_TRIP')
  addUpcountryLoad(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTripLoadDto,
  ) {
    return this.tripsService.addUpcountryLoad(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Put(':id/upcountry-loads/:loadId')
  @RequirePermissions('UPDATE_TRIP')
  updateUpcountryLoad(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('loadId', ParseUUIDPipe) loadId: string,
    @Body() dto: UpdateTripLoadDto,
  ) {
    return this.tripsService.updateUpcountryLoad(
      id,
      loadId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/upcountry-loads/:loadId/status')
  @RequirePermissions('UPDATE_TRIP')
  changeUpcountryLoadStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('loadId', ParseUUIDPipe) loadId: string,
    @Body() dto: ChangeTripLoadStatusDto,
  ) {
    return this.tripsService.changeUpcountryLoadStatus(
      id,
      loadId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Post(':id/downcountry-loads')
  @RequirePermissions('UPDATE_TRIP')
  addDowncountryLoad(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTripLoadDto,
  ) {
    return this.tripsService.addDowncountryLoad(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Put(':id/downcountry-loads/:loadId')
  @RequirePermissions('UPDATE_TRIP')
  updateDowncountryLoad(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('loadId', ParseUUIDPipe) loadId: string,
    @Body() dto: UpdateTripLoadDto,
  ) {
    return this.tripsService.updateDowncountryLoad(
      id,
      loadId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/downcountry-loads/:loadId/status')
  @RequirePermissions('UPDATE_TRIP')
  changeDowncountryLoadStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('loadId', ParseUUIDPipe) loadId: string,
    @Body() dto: ChangeTripLoadStatusDto,
  ) {
    return this.tripsService.changeDowncountryLoadStatus(
      id,
      loadId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Put(':id/office-expenses/:expenseId')
  @RequirePermissions('UPDATE_TRIP')
  updateOfficeExpense(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @Body() dto: UpdateTripOfficeExpenseDto,
  ) {
    return this.tripsService.updateOfficeExpense(
      id,
      expenseId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Put(':id/pump-expenses/:expenseId')
  @RequirePermissions('UPDATE_TRIP')
  updatePumpExpense(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @Body() dto: UpdateTripPumpExpenseDto,
  ) {
    return this.tripsService.updatePumpExpense(
      id,
      expenseId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Put(':id/fuel-expenses/:expenseId')
  @RequirePermissions('UPDATE_TRIP')
  updateFuelExpense(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @Body() dto: UpdateTripFuelExpenseDto,
  ) {
    return this.tripsService.updateFuelExpense(
      id,
      expenseId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Put(':id/mtag-expenses/:expenseId')
  @RequirePermissions('UPDATE_TRIP')
  updateMtagExpense(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @Body() dto: UpdateTripAssetExpenseDto,
  ) {
    return this.tripsService.updateMtagExpense(
      id,
      expenseId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Put(':id/other-expenses/:expenseId')
  @RequirePermissions('UPDATE_TRIP')
  updateOtherExpense(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @Body() dto: UpdateTripAssetExpenseDto,
  ) {
    return this.tripsService.updateOtherExpense(
      id,
      expenseId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/expenses/:kind/:expenseId/status')
  @RequirePermissions('UPDATE_TRIP')
  changeExpenseStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kind') kind: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @Body() dto: ChangeTripExpenseStatusDto,
  ) {
    if (!EXPENSE_KINDS.includes(kind as ExpenseKind)) {
      throw new BadRequestException(
        `Invalid expense kind. Use one of: ${EXPENSE_KINDS.join(', ')}`,
      );
    }
    return this.tripsService.changeExpenseStatus(
      id,
      kind as ExpenseKind,
      expenseId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_TRIP')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tripsService.remove(id, buildActivityContext(user, req));
  }
}
