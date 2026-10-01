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
  AdjustAttendanceDto,
  AttendanceDashboardQueryDto,
  AttendanceListQueryDto,
  EmployeeAttendanceDetailQueryDto,
  ManualAttendanceDto,
  MarkLeaveDto,
  PunchAttendanceDto,
  UpsertLeaveBalanceDto,
} from '../auth/dto/attendance.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { AttendanceDashboardService } from '../services/attendance-dashboard.service';
import { AttendancesService } from '../services/attendances.service';
import { LeaveRequestsService } from '../services/leave-requests.service';

@Controller('attendances')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AttendancesController {
  constructor(
    private readonly attendancesService: AttendancesService,
    private readonly dashboardService: AttendanceDashboardService,
    private readonly leaveRequestsService: LeaveRequestsService,
  ) {}

  // ── Dashboard / lists (static routes first) ───────────────

  @Get('dashboard')
  @RequirePermissions('VIEW_ATTENDANCE', 'VIEW_ATTENDANCE_DASHBOARD')
  dashboard(@Query() query: AttendanceDashboardQueryDto) {
    return this.dashboardService.dashboard(query);
  }

  @Get()
  @RequirePermissions('VIEW_ATTENDANCE')
  findAll(@Query() query: AttendanceListQueryDto) {
    return this.dashboardService.listAttendances(query);
  }

  @Get('employees/:employeeId')
  @RequirePermissions('VIEW_ATTENDANCE')
  employeeDetail(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query() query: EmployeeAttendanceDetailQueryDto,
  ) {
    return this.dashboardService.employeeDetail(employeeId, query);
  }

  @Get('employees/:employeeId/leave-balance')
  @RequirePermissions('VIEW_ATTENDANCE', 'MARK_LEAVE')
  leaveBalance(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query('year') year?: string,
  ) {
    return this.leaveRequestsService.getBalance(
      employeeId,
      year ? Number(year) : undefined,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_ATTENDANCE')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.attendancesService.findOne(id);
  }

  // ── Mutations ─────────────────────────────────────────────

  @Post('manual')
  @RequirePermissions('CREATE_ATTENDANCE')
  manual(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: ManualAttendanceDto,
  ) {
    return this.attendancesService.manualEntry(
      dto,
      user,
      buildActivityContext(user, req),
    );
  }

  @Post('check-in')
  @RequirePermissions('PUNCH_ATTENDANCE', 'CREATE_ATTENDANCE')
  checkIn(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: PunchAttendanceDto,
  ) {
    return this.attendancesService.checkIn(
      dto,
      user,
      buildActivityContext(user, req),
    );
  }

  @Post('check-out')
  @RequirePermissions('PUNCH_ATTENDANCE', 'CREATE_ATTENDANCE')
  checkOut(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: PunchAttendanceDto,
  ) {
    return this.attendancesService.checkOut(
      dto,
      user,
      buildActivityContext(user, req),
    );
  }

  @Post('break-start')
  @RequirePermissions('PUNCH_ATTENDANCE', 'CREATE_ATTENDANCE')
  breakStart(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: PunchAttendanceDto,
  ) {
    return this.attendancesService.breakStart(
      dto,
      user,
      buildActivityContext(user, req),
    );
  }

  @Post('break-end')
  @RequirePermissions('PUNCH_ATTENDANCE', 'CREATE_ATTENDANCE')
  breakEnd(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: PunchAttendanceDto,
  ) {
    return this.attendancesService.breakEnd(
      dto,
      user,
      buildActivityContext(user, req),
    );
  }

  @Post('leaves')
  @RequirePermissions('MARK_LEAVE')
  markLeave(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: MarkLeaveDto,
  ) {
    return this.leaveRequestsService.markLeave(
      dto,
      user,
      buildActivityContext(user, req),
    );
  }

  @Put('leave-balances')
  @RequirePermissions('MARK_LEAVE', 'UPDATE_ATTENDANCE')
  upsertLeaveBalance(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: UpsertLeaveBalanceDto,
  ) {
    return this.leaveRequestsService.upsertBalance(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Put(':id/adjust')
  @RequirePermissions('UPDATE_ATTENDANCE')
  adjust(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustAttendanceDto,
  ) {
    return this.attendancesService.adjust(
      id,
      dto,
      user,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_ATTENDANCE')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.attendancesService.remove(
      id,
      buildActivityContext(user, req),
    );
  }
}
