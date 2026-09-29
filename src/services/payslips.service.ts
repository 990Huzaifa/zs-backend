import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PayslipListQueryDto,
  UpdatePayslipDto,
} from '../auth/dto/hr.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  computeOvertimeAmount,
  toMoney,
} from '../common/utils/payroll.util';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import {
  PayrollRunStatus,
  Payslip,
  PayslipStatus,
} from '../database/entities/hr/payroll.entity';
import { ActivitiesService } from './activities.service';

@Injectable()
export class PayslipsService {
  constructor(
    @InjectRepository(Payslip)
    private readonly payslipRepo: Repository<Payslip>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async findAll(query: PayslipListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.payslipRepo
      .createQueryBuilder('slip')
      .leftJoinAndSelect('slip.employee', 'employee')
      .leftJoinAndSelect('employee.user', 'user')
      .leftJoinAndSelect('slip.payrollRun', 'payrollRun')
      .leftJoinAndSelect('payrollRun.payPeriod', 'payPeriod')
      .leftJoinAndSelect('slip.employeeSalary', 'employeeSalary')
      .orderBy('slip.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.payrollRunId) {
      qb.andWhere('slip.payrollRunId = :payrollRunId', {
        payrollRunId: query.payrollRunId,
      });
    }
    if (query.employeeId) {
      qb.andWhere('slip.employeeId = :employeeId', {
        employeeId: query.employeeId,
      });
    }
    if (query.status) {
      qb.andWhere('slip.status = :status', { status: query.status });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        '(user.name ILIKE :search OR user.code ILIKE :search OR payPeriod.name ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const [rows, total] = await qb.getManyAndCount();
    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string) {
    return this.toResponse(await this.findByIdOrFail(id));
  }

  /**
   * Adjust draft payslip deductions / OT and recalculate totals.
   * Only allowed while parent run is DRAFT or CALCULATED.
   */
  async update(
    id: string,
    dto: UpdatePayslipDto,
    activity?: ActivityActorContext,
  ) {
    const slip = await this.findByIdOrFail(id);
    if (slip.status !== PayslipStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT payslips can be edited');
    }

    const runStatus = slip.payrollRun?.status;
    if (
      runStatus &&
      runStatus !== PayrollRunStatus.DRAFT &&
      runStatus !== PayrollRunStatus.CALCULATED
    ) {
      throw new BadRequestException(
        `Cannot edit payslip while payroll run is ${runStatus}`,
      );
    }

    if (dto.overtimeMinutes !== undefined) {
      slip.overtimeMinutes = dto.overtimeMinutes;
      const rate =
        slip.employeeSalary?.overtimeRatePerHour == null
          ? null
          : toMoney(slip.employeeSalary.overtimeRatePerHour);
      slip.overtimeAmount = computeOvertimeAmount(dto.overtimeMinutes, rate);
    }
    if (dto.otherDeductionAmount !== undefined) {
      slip.otherDeductionAmount = toMoney(dto.otherDeductionAmount);
    }

    // Preserve earnings + attendance snapshot; refresh totals only.
    slip.grossAmount = toMoney(
      toMoney(slip.basicSalary) +
        toMoney(slip.houseAllowance) +
        toMoney(slip.transportAllowance) +
        toMoney(slip.mobileAllowance) +
        toMoney(slip.mealAllowance) +
        toMoney(slip.otherAllowance) +
        toMoney(slip.overtimeAmount),
    );
    slip.totalDeductions = toMoney(
      toMoney(slip.attendanceDeductionAmount) +
        toMoney(slip.otherDeductionAmount),
    );
    slip.netAmount = toMoney(
      Math.max(0, slip.grossAmount - slip.totalDeductions),
    );

    await this.payslipRepo.save(slip);

    const name = slip.employee?.user?.name ?? slip.employeeId;
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'Payslip',
        entityId: id,
        record: name,
        description: `Updated payslip for ${name}`,
      },
      activity,
    );

    return this.findOne(id);
  }

  async listUtility(opts: {
    search?: string;
    payrollRunId?: string;
    employeeId?: string;
    status?: PayslipStatus;
  } = {}) {
    const qb = this.payslipRepo
      .createQueryBuilder('slip')
      .leftJoinAndSelect('slip.employee', 'employee')
      .leftJoinAndSelect('employee.user', 'user')
      .leftJoinAndSelect('slip.payrollRun', 'payrollRun')
      .leftJoinAndSelect('payrollRun.payPeriod', 'payPeriod')
      .orderBy('user.name', 'ASC');

    if (opts.payrollRunId) {
      qb.andWhere('slip.payrollRunId = :payrollRunId', {
        payrollRunId: opts.payrollRunId,
      });
    }
    if (opts.employeeId) {
      qb.andWhere('slip.employeeId = :employeeId', {
        employeeId: opts.employeeId,
      });
    }
    if (opts.status) {
      qb.andWhere('slip.status = :status', { status: opts.status });
    }

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere(
        '(user.name ILIKE :search OR user.code ILIKE :search OR payPeriod.name ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const rows = await qb.getMany();
    return {
      data: rows.map((s) => ({
        id: s.id,
        label: `${s.employee?.user?.name ?? s.employeeId} — ${toMoney(s.netAmount)}`,
        payrollRunId: s.payrollRunId,
        employeeId: s.employeeId,
        employeeName: s.employee?.user?.name ?? null,
        payPeriodName: s.payrollRun?.payPeriod?.name ?? null,
        netAmount: toMoney(s.netAmount),
        status: s.status,
      })),
    };
  }

  private async findByIdOrFail(id: string) {
    const slip = await this.payslipRepo.findOne({
      where: { id },
      relations: {
        employee: { user: true, department: true },
        payrollRun: { payPeriod: true },
        employeeSalary: true,
        salaryVoucher: true,
      },
    });
    if (!slip) {
      throw new NotFoundException('Payslip not found');
    }
    return slip;
  }

  private toResponse(slip: Payslip) {
    const employee = slip.employee;
    const user = employee?.user;
    return {
      id: slip.id,
      payrollRunId: slip.payrollRunId,
      employeeId: slip.employeeId,
      employeeSalaryId: slip.employeeSalaryId,
      basicSalary: toMoney(slip.basicSalary),
      houseAllowance: toMoney(slip.houseAllowance),
      transportAllowance: toMoney(slip.transportAllowance),
      mobileAllowance: toMoney(slip.mobileAllowance),
      mealAllowance: toMoney(slip.mealAllowance),
      otherAllowance: toMoney(slip.otherAllowance),
      overtimeMinutes: slip.overtimeMinutes,
      overtimeAmount: toMoney(slip.overtimeAmount),
      presentDays: slip.presentDays,
      absentDays: slip.absentDays,
      unpaidLeaveDays: slip.unpaidLeaveDays,
      paidLeaveDays: slip.paidLeaveDays,
      holidayDays: slip.holidayDays,
      workedMinutes: slip.workedMinutes,
      lateMinutes: slip.lateMinutes,
      shortfallMinutes: slip.shortfallMinutes,
      attendanceDeductionAmount: toMoney(slip.attendanceDeductionAmount),
      otherDeductionAmount: toMoney(slip.otherDeductionAmount),
      grossAmount: toMoney(slip.grossAmount),
      totalDeductions: toMoney(slip.totalDeductions),
      netAmount: toMoney(slip.netAmount),
      status: slip.status,
      salaryVoucherId: slip.salaryVoucherId,
      createdAt: slip.createdAt,
      updatedAt: slip.updatedAt,
      employee: employee
        ? {
            id: employee.id,
            name: user?.name ?? null,
            code: user?.code ?? null,
            designation: employee.designation ?? null,
            departmentId: employee.departmentId ?? null,
            departmentName: employee.department?.name ?? null,
          }
        : null,
      payrollRun: slip.payrollRun
        ? {
            id: slip.payrollRun.id,
            status: slip.payrollRun.status,
            payPeriodId: slip.payrollRun.payPeriodId,
            payPeriod: slip.payrollRun.payPeriod
              ? {
                  id: slip.payrollRun.payPeriod.id,
                  name: slip.payrollRun.payPeriod.name,
                  startDate: slip.payrollRun.payPeriod.startDate,
                  endDate: slip.payrollRun.payPeriod.endDate,
                }
              : null,
          }
        : null,
    };
  }
}
