import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  CreateEmployeeSalaryDto,
  EmployeeSalaryListQueryDto,
  UpdateEmployeeSalaryDto,
} from '../auth/dto/hr.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  isSalaryEffectiveOn,
  parseIsoDate,
  sumAllowances,
  toMoney,
} from '../common/utils/payroll.util';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { Employee } from '../database/entities/hr/employee.entity';
import {
  EmployeeSalary,
  PayType,
} from '../database/entities/hr/payroll.entity';
import { ActivitiesService } from './activities.service';

@Injectable()
export class EmployeeSalariesService {
  constructor(
    @InjectRepository(EmployeeSalary)
    private readonly salaryRepo: Repository<EmployeeSalary>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(dto: CreateEmployeeSalaryDto, activity?: ActivityActorContext) {
    await this.ensureEmployee(dto.employeeId);
    this.assertEffectiveWindow(dto.effectiveFrom, dto.effectiveTo ?? null);

    const isActive = dto.isActive ?? true;
    if (isActive) {
      await this.deactivatePreviousActive(dto.employeeId);
    }

    const saved = await this.salaryRepo.save(
      this.salaryRepo.create({
        employeeId: dto.employeeId,
        payType: dto.payType ?? PayType.MONTHLY,
        basicSalary: toMoney(dto.basicSalary),
        houseAllowance: toMoney(dto.houseAllowance),
        transportAllowance: toMoney(dto.transportAllowance),
        mobileAllowance: toMoney(dto.mobileAllowance),
        mealAllowance: toMoney(dto.mealAllowance),
        otherAllowance: toMoney(dto.otherAllowance),
        overtimeRatePerHour:
          dto.overtimeRatePerHour == null
            ? null
            : toMoney(dto.overtimeRatePerHour),
        effectiveFrom: dto.effectiveFrom.slice(0, 10),
        effectiveTo: dto.effectiveTo ? dto.effectiveTo.slice(0, 10) : null,
        isActive,
      }),
    );

    const result = await this.findOne(saved.id);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'EmployeeSalary',
        entityId: saved.id,
        record: result.employee?.name ?? saved.employeeId,
        description: `Created salary structure for ${result.employee?.name ?? saved.employeeId}`,
      },
      activity,
    );
    return result;
  }

  async findAll(query: EmployeeSalaryListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.salaryRepo
      .createQueryBuilder('salary')
      .leftJoinAndSelect('salary.employee', 'employee')
      .leftJoinAndSelect('employee.user', 'user')
      .orderBy('salary.effectiveFrom', 'DESC')
      .addOrderBy('salary.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.employeeId) {
      qb.andWhere('salary.employeeId = :employeeId', {
        employeeId: query.employeeId,
      });
    }
    if (query.payType) {
      qb.andWhere('salary.payType = :payType', { payType: query.payType });
    }
    if (query.isActive !== undefined) {
      qb.andWhere('salary.isActive = :isActive', { isActive: query.isActive });
    }
    if (query.asOf) {
      const asOf = query.asOf.slice(0, 10);
      qb.andWhere('salary.effectiveFrom <= :asOf', { asOf });
      qb.andWhere(
        '(salary.effectiveTo IS NULL OR salary.effectiveTo >= :asOf)',
        { asOf },
      );
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        '(user.name ILIKE :search OR user.code ILIKE :search OR user.email ILIKE :search)',
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

  async update(
    id: string,
    dto: UpdateEmployeeSalaryDto,
    activity?: ActivityActorContext,
  ) {
    const salary = await this.findByIdOrFail(id);

    const effectiveFrom =
      dto.effectiveFrom !== undefined
        ? dto.effectiveFrom.slice(0, 10)
        : salary.effectiveFrom;
    const effectiveTo =
      dto.effectiveTo !== undefined
        ? dto.effectiveTo
          ? dto.effectiveTo.slice(0, 10)
          : null
        : salary.effectiveTo;
    this.assertEffectiveWindow(effectiveFrom, effectiveTo);

    if (dto.payType !== undefined) salary.payType = dto.payType;
    if (dto.basicSalary !== undefined) {
      salary.basicSalary = toMoney(dto.basicSalary);
    }
    if (dto.houseAllowance !== undefined) {
      salary.houseAllowance = toMoney(dto.houseAllowance);
    }
    if (dto.transportAllowance !== undefined) {
      salary.transportAllowance = toMoney(dto.transportAllowance);
    }
    if (dto.mobileAllowance !== undefined) {
      salary.mobileAllowance = toMoney(dto.mobileAllowance);
    }
    if (dto.mealAllowance !== undefined) {
      salary.mealAllowance = toMoney(dto.mealAllowance);
    }
    if (dto.otherAllowance !== undefined) {
      salary.otherAllowance = toMoney(dto.otherAllowance);
    }
    if (dto.overtimeRatePerHour !== undefined) {
      salary.overtimeRatePerHour =
        dto.overtimeRatePerHour == null
          ? null
          : toMoney(dto.overtimeRatePerHour);
    }
    salary.effectiveFrom = effectiveFrom;
    salary.effectiveTo = effectiveTo;

    if (dto.isActive !== undefined) {
      if (dto.isActive && !salary.isActive) {
        await this.deactivatePreviousActive(salary.employeeId, salary.id);
      }
      salary.isActive = dto.isActive;
    }

    await this.salaryRepo.save(salary);

    const result = await this.findOne(id);
    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'EmployeeSalary',
        entityId: id,
        record: result.employee?.name ?? salary.employeeId,
        description: `Updated salary structure for ${result.employee?.name ?? salary.employeeId}`,
      },
      activity,
    );
    return result;
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const salary = await this.findByIdOrFail(id);
    const name = salary.employee?.user?.name ?? salary.employeeId;
    await this.salaryRepo.remove(salary);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'EmployeeSalary',
        entityId: id,
        record: name,
        description: `Deleted salary structure for ${name}`,
      },
      activity,
    );

    return { id, deleted: true };
  }

  /** Active salary for an employee as of a date (defaults to today UTC). */
  async getActiveForEmployee(employeeId: string, asOf?: string) {
    await this.ensureEmployee(employeeId);
    const date = (asOf ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
    const rows = await this.salaryRepo.find({
      where: { employeeId, isActive: true },
      relations: { employee: { user: true } },
      order: { effectiveFrom: 'DESC' },
    });

    const match = rows.find((row) => isSalaryEffectiveOn(row, date, true));
    if (!match) {
      throw new NotFoundException(
        `No active salary found for employee on ${date}`,
      );
    }
    return this.toResponse(match);
  }

  async listUtility(opts: {
    search?: string;
    employeeId?: string;
    isActive?: boolean;
  } = {}) {
    const qb = this.salaryRepo
      .createQueryBuilder('salary')
      .leftJoinAndSelect('salary.employee', 'employee')
      .leftJoinAndSelect('employee.user', 'user')
      .orderBy('user.name', 'ASC')
      .addOrderBy('salary.effectiveFrom', 'DESC');

    if (opts.employeeId) {
      qb.andWhere('salary.employeeId = :employeeId', {
        employeeId: opts.employeeId,
      });
    }
    if (opts.isActive !== undefined) {
      qb.andWhere('salary.isActive = :isActive', { isActive: opts.isActive });
    }

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere(
        '(user.name ILIKE :search OR user.code ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const rows = await qb.getMany();
    return {
      data: rows.map((s) => ({
        id: s.id,
        label: `${s.employee?.user?.name ?? s.employeeId} — ${toMoney(s.basicSalary)} (${s.payType})`,
        employeeId: s.employeeId,
        employeeName: s.employee?.user?.name ?? null,
        payType: s.payType,
        basicSalary: toMoney(s.basicSalary),
        totalAllowances: sumAllowances(s),
        effectiveFrom: s.effectiveFrom,
        effectiveTo: s.effectiveTo,
        isActive: s.isActive,
      })),
    };
  }

  async findActiveMapForEmployees(
    employeeIds: string[],
    asOf: string,
  ): Promise<Map<string, EmployeeSalary>> {
    if (employeeIds.length === 0) return new Map();
    const rows = await this.salaryRepo.find({
      where: { employeeId: In(employeeIds), isActive: true },
      order: { effectiveFrom: 'DESC' },
    });

    const map = new Map<string, EmployeeSalary>();
    for (const row of rows) {
      if (map.has(row.employeeId)) continue;
      if (isSalaryEffectiveOn(row, asOf, true)) {
        map.set(row.employeeId, row);
      }
    }
    return map;
  }

  private async deactivatePreviousActive(
    employeeId: string,
    excludeId?: string,
  ) {
    const qb = this.salaryRepo
      .createQueryBuilder()
      .update(EmployeeSalary)
      .set({ isActive: false })
      .where('employeeId = :employeeId', { employeeId })
      .andWhere('isActive = true');
    if (excludeId) {
      qb.andWhere('id != :excludeId', { excludeId });
    }
    await qb.execute();
  }

  private assertEffectiveWindow(
    effectiveFrom: string,
    effectiveTo: string | null,
  ) {
    if (!parseIsoDate(effectiveFrom)) {
      throw new BadRequestException('Invalid effectiveFrom date');
    }
    if (effectiveTo) {
      if (!parseIsoDate(effectiveTo)) {
        throw new BadRequestException('Invalid effectiveTo date');
      }
      if (effectiveTo < effectiveFrom) {
        throw new BadRequestException(
          'effectiveTo must be on or after effectiveFrom',
        );
      }
    }
  }

  private async ensureEmployee(id: string) {
    const employee = await this.employeeRepo.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    return employee;
  }

  private async findByIdOrFail(id: string) {
    const salary = await this.salaryRepo.findOne({
      where: { id },
      relations: { employee: { user: true, department: true } },
    });
    if (!salary) {
      throw new NotFoundException('Employee salary not found');
    }
    return salary;
  }

  private toResponse(salary: EmployeeSalary) {
    const employee = salary.employee;
    const user = employee?.user;
    return {
      id: salary.id,
      employeeId: salary.employeeId,
      payType: salary.payType,
      basicSalary: toMoney(salary.basicSalary),
      houseAllowance: toMoney(salary.houseAllowance),
      transportAllowance: toMoney(salary.transportAllowance),
      mobileAllowance: toMoney(salary.mobileAllowance),
      mealAllowance: toMoney(salary.mealAllowance),
      otherAllowance: toMoney(salary.otherAllowance),
      totalAllowances: sumAllowances(salary),
      overtimeRatePerHour:
        salary.overtimeRatePerHour == null
          ? null
          : toMoney(salary.overtimeRatePerHour),
      effectiveFrom: salary.effectiveFrom,
      effectiveTo: salary.effectiveTo,
      isActive: salary.isActive,
      createdAt: salary.createdAt,
      updatedAt: salary.updatedAt,
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
    };
  }
}
