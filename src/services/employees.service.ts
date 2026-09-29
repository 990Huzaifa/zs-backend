import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { DataSource, Repository } from 'typeorm';
import {
  CreateEmployeeDto,
  EmployeeListQueryDto,
  UpdateEmployeeDto,
} from '../auth/dto/hr.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  nextSerialCode,
  USER_CODE_PAD,
  USER_CODE_PREFIX,
} from '../common/utils/serial-code.util';
import { COA_PARENT_CODES } from '../database/chart-of-accounts/constants/coa-parent-codes';
import { S3Service } from '../common/s3/s3.service';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import {
  ChartOfAccountKind,
} from '../database/entities/chart-of-account.entity';
import {
  Department,
  Employee,
  EmploymentType,
  Gender,
  MaritalStatus,
} from '../database/entities/hr/employee.entity';
import { ProfileType, User } from '../database/entities/user.entity';
import { Role } from '../database/entities/role.entity';
import { ActivitiesService } from './activities.service';
import { ChartOfAccountsService } from './chart-of-accounts.service';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    private readonly dataSource: DataSource,
    private readonly activitiesService: ActivitiesService,
    private readonly chartOfAccountsService: ChartOfAccountsService,
    private readonly s3Service: S3Service,
  ) {}

  async create(dto: CreateEmployeeDto, activity?: ActivityActorContext) {
    if (dto.departmentId) {
      await this.ensureDepartment(dto.departmentId);
    }

    const savedId = dto.userId
      ? await this.createFromExistingUser(dto)
      : await this.createWithNewUser(dto);

    const result = await this.findOne(savedId);
    const record = result.user?.name ?? result.id;
    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'Employee',
        entityId: result.id,
        record,
        description: dto.userId
          ? `Registered existing user as employee ${record}`
          : `Created employee ${record}`,
        metadata: {
          mode: dto.userId ? 'existing_user' : 'new_user',
          userId: result.userId,
        },
      },
      activity,
    );
    return result;
  }

  /** Case A: attach HR profile to an existing user. */
  private async createFromExistingUser(dto: CreateEmployeeDto): Promise<string> {
    const userId = dto.userId!;
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingEmployee = await this.employeeRepo.findOne({
      where: { userId },
    });
    if (existingEmployee) {
      throw new ConflictException('User is already registered as an employee');
    }

    const phone = this.nullableTrim(dto.phone) ?? user.phone ?? null;

    return this.dataSource.transaction(async (manager) => {
      if (dto.phone !== undefined) {
        user.phone = phone;
        await manager.save(user);
      }

      const employee = await manager.save(
        manager.create(Employee, {
          userId: user.id,
          designation: this.nullableTrim(dto.designation),
          departmentId: dto.departmentId ?? null,
          employmentType: dto.employmentType ?? EmploymentType.PERMANENT,
          gender: dto.gender ?? Gender.MALE,
          maritalStatus: dto.maritalStatus ?? MaritalStatus.SINGLE,
          dateOfBirth: this.parseOptionalDate(dto.dateOfBirth),
          attendanceEnabled: dto.attendanceEnabled ?? true,
        }),
      );

      await this.chartOfAccountsService.createLinkedLeaf(
        {
          parentCode: COA_PARENT_CODES.SALARIES_PAYABLE,
          name: user.name,
          userId: user.id,
          accountKind: ChartOfAccountKind.EMPLOYEE_SALARY_PAYABLE,
        },
        manager,
      );

      return employee.id;
    });
  }

  /** Case B: create new user + employee together. */
  private async createWithNewUser(dto: CreateEmployeeDto): Promise<string> {
    const employeeName = dto.name?.trim();
    if (!employeeName) {
      throw new BadRequestException(
        'name is required when creating a new employee (or pass userId to register an existing user)',
      );
    }

    const email = dto.email?.trim()
      ? dto.email.toLowerCase().trim()
      : null;
    if (email) {
      const existing = await this.userRepo.findOne({ where: { email } });
      if (existing) {
        throw new ConflictException('Email already registered');
      }
    }

    const role = await this.resolveEmployeeRole(dto.roleId);
    const hashedPassword = dto.password
      ? await bcrypt.hash(dto.password, 10)
      : null;
    const code = await this.generateUniqueUserCode();
    const phone = this.nullableTrim(dto.phone);

    return this.dataSource.transaction(async (manager) => {
      const user = await manager.save(
        manager.create(User, {
          name: employeeName,
          email,
          password: hashedPassword,
          phone,
          profileType: ProfileType.COMPANY_USER,
          role,
          roleId: role.id,
          code,
          isEmailVerified: Boolean(email),
        }),
      );

      const employee = await manager.save(
        manager.create(Employee, {
          userId: user.id,
          designation: this.nullableTrim(dto.designation),
          departmentId: dto.departmentId ?? null,
          employmentType: dto.employmentType ?? EmploymentType.PERMANENT,
          gender: dto.gender ?? Gender.MALE,
          maritalStatus: dto.maritalStatus ?? MaritalStatus.SINGLE,
          dateOfBirth: this.parseOptionalDate(dto.dateOfBirth),
          attendanceEnabled: dto.attendanceEnabled ?? true,
        }),
      );

      await this.chartOfAccountsService.createLinkedLeaf(
        {
          parentCode: COA_PARENT_CODES.SALARIES_PAYABLE,
          name: employeeName,
          userId: user.id,
          accountKind: ChartOfAccountKind.EMPLOYEE_SALARY_PAYABLE,
        },
        manager,
      );

      return employee.id;
    });
  }

  async findAll(query: EmployeeListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.employeeRepo
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.user', 'user')
      .leftJoinAndSelect('employee.department', 'department')
      .orderBy('employee.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.departmentId) {
      qb.andWhere('employee.departmentId = :departmentId', {
        departmentId: query.departmentId,
      });
    }
    if (query.employmentType) {
      qb.andWhere('employee.employmentType = :employmentType', {
        employmentType: query.employmentType,
      });
    }
    if (query.gender) {
      qb.andWhere('employee.gender = :gender', { gender: query.gender });
    }
    if (query.attendanceEnabled !== undefined) {
      qb.andWhere('employee.attendanceEnabled = :attendanceEnabled', {
        attendanceEnabled: query.attendanceEnabled,
      });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          user.name ILIKE :search
          OR user.code ILIKE :search
          OR user.email ILIKE :search
          OR user.phone ILIKE :search
          OR employee.designation ILIKE :search
          OR department.name ILIKE :search
        )`,
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
    dto: UpdateEmployeeDto,
    activity?: ActivityActorContext,
  ) {
    const employee = await this.findByIdOrFail(id);
    const user = employee.user;

    if (dto.departmentId !== undefined) {
      if (dto.departmentId) {
        await this.ensureDepartment(dto.departmentId);
      }
      employee.departmentId = dto.departmentId;
    }
    if (dto.designation !== undefined) {
      employee.designation = this.nullableTrim(dto.designation);
    }
    if (dto.employmentType !== undefined) {
      employee.employmentType = dto.employmentType;
    }
    if (dto.gender !== undefined) {
      employee.gender = dto.gender;
    }
    if (dto.maritalStatus !== undefined) {
      employee.maritalStatus = dto.maritalStatus;
    }
    if (dto.dateOfBirth !== undefined) {
      employee.dateOfBirth = this.parseOptionalDate(dto.dateOfBirth);
    }
    if (dto.phone !== undefined) {
      user.phone = this.nullableTrim(dto.phone);
    }
    if (dto.attendanceEnabled !== undefined) {
      employee.attendanceEnabled = dto.attendanceEnabled;
    }

    if (dto.name !== undefined) {
      user.name = dto.name.trim();
    }
    if (dto.email !== undefined) {
      const email = dto.email?.trim()
        ? dto.email.toLowerCase().trim()
        : null;
      if (email && email !== user.email) {
        const existing = await this.userRepo.findOne({ where: { email } });
        if (existing && existing.id !== user.id) {
          throw new ConflictException('Email already registered');
        }
      }
      user.email = email;
    }
    if (dto.password !== undefined && dto.password) {
      user.password = await bcrypt.hash(dto.password, 10);
    }
    if (dto.roleId !== undefined) {
      if (dto.roleId) {
        const role = await this.resolveEmployeeRole(dto.roleId);
        user.roleId = role.id;
        user.role = role;
      }
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.save(user);
      await manager.save(employee);
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'Employee',
        entityId: employee.id,
        record: user.name,
        description: `Updated employee ${user.name}`,
      },
      activity,
    );

    return this.findOne(id);
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const employee = await this.findByIdOrFail(id);
    const name = employee.user?.name ?? employee.id;

    // Remove HR profile only; linked user account is kept (may be referenced elsewhere).
    await this.employeeRepo.remove(employee);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'Employee',
        entityId: id,
        record: name,
        description: `Deleted employee ${name}`,
      },
      activity,
    );

    return { id, deleted: true };
  }

  async listUtility(opts: {
    search?: string;
    departmentId?: string;
    employmentType?: EmploymentType;
  } = {}) {
    const qb = this.employeeRepo
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.user', 'user')
      .leftJoinAndSelect('employee.department', 'department')
      .orderBy('user.name', 'ASC');

    if (opts.departmentId) {
      qb.andWhere('employee.departmentId = :departmentId', {
        departmentId: opts.departmentId,
      });
    }
    if (opts.employmentType) {
      qb.andWhere('employee.employmentType = :employmentType', {
        employmentType: opts.employmentType,
      });
    }

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere(
        '(user.name ILIKE :search OR user.code ILIKE :search OR user.phone ILIKE :search OR user.email ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const rows = await qb.getMany();
    return {
      data: rows.map((e) => {
        const avatar = e.user?.avatar ?? null;
        return {
          id: e.id,
          label: e.user?.name ?? e.id,
          name: e.user?.name ?? null,
          userCode: e.user?.code ?? null,
          phone: e.user?.phone ?? null,
          email: e.user?.email ?? null,
          avatar,
          avatarUrl: avatar ? this.s3Service.getObjectUrl(avatar) : null,
          designation: e.designation ?? null,
          departmentId: e.departmentId ?? null,
          departmentName: e.department?.name ?? null,
          employmentType: e.employmentType,
          attendanceEnabled: e.attendanceEnabled,
        };
      }),
    };
  }

  /**
   * Users that do not yet have an employee profile (Case A picker).
   */
  async listAvailableUsers(opts: { search?: string } = {}) {
    const qb = this.userRepo
      .createQueryBuilder('user')
      .leftJoin('user.employee', 'employee')
      .leftJoinAndSelect('user.role', 'role')
      .where('employee.id IS NULL')
      .orderBy('user.name', 'ASC');

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere(
        '(user.name ILIKE :search OR user.code ILIKE :search OR user.email ILIKE :search OR user.phone ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const rows = await qb.getMany();
    return {
      data: rows.map((u) => ({
        id: u.id,
        label: u.name,
        name: u.name,
        code: u.code,
        email: u.email,
        phone: u.phone ?? null,
        profileType: u.profileType,
        roleId: u.roleId,
        roleName: u.role?.name ?? null,
      })),
    };
  }

  private async findByIdOrFail(id: string): Promise<Employee> {
    const employee = await this.employeeRepo.findOne({
      where: { id },
      relations: {
        user: { role: true },
        department: true,
      },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    return employee;
  }

  private async ensureDepartment(id: string) {
    const department = await this.departmentRepo.findOne({ where: { id } });
    if (!department) {
      throw new NotFoundException('Department not found');
    }
    return department;
  }

  private async resolveEmployeeRole(roleId?: string | null): Promise<Role> {
    if (roleId) {
      const role = await this.roleRepo.findOne({ where: { id: roleId } });
      if (!role) {
        throw new NotFoundException('Role not found');
      }
      return role;
    }

    const fallback =
      (await this.roleRepo.findOne({ where: { code: 'USER' } })) ??
      (await this.roleRepo.findOne({ where: { isActive: true } }));
    if (!fallback) {
      throw new NotFoundException('No active role found');
    }
    return fallback;
  }

  private async generateUniqueUserCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = await nextSerialCode(
        this.userRepo,
        USER_CODE_PREFIX,
        'code',
        USER_CODE_PAD,
        attempt,
      );
      const existing = await this.userRepo.findOne({ where: { code } });
      if (!existing) return code;
    }
    throw new ConflictException('Could not generate unique employee code');
  }

  private toResponse(employee: Employee) {
    const user = employee.user;
    const avatar = user?.avatar ?? null;
    const avatarUrl = avatar ? this.s3Service.getObjectUrl(avatar) : null;
    return {
      id: employee.id,
      userId: employee.userId,
      designation: employee.designation ?? null,
      departmentId: employee.departmentId ?? null,
      employmentType: employee.employmentType,
      gender: employee.gender ?? null,
      maritalStatus: employee.maritalStatus ?? null,
      dateOfBirth: employee.dateOfBirth ?? null,
      attendanceEnabled: employee.attendanceEnabled,
      avatar,
      avatarUrl,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
      department: employee.department
        ? {
            id: employee.department.id,
            name: employee.department.name,
          }
        : null,
      user: user
        ? {
            id: user.id,
            code: user.code,
            name: user.name,
            email: user.email,
            phone: user.phone ?? null,
            avatar,
            avatarUrl,
            profileType: user.profileType,
            roleId: user.roleId,
            role: user.role
              ? {
                  id: user.role.id,
                  code: user.role.code,
                  name: user.role.name,
                }
              : null,
          }
        : null,
    };
  }

  private parseOptionalDate(value?: string | null): Date | null {
    if (value === undefined || value === null || value === '') return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('Invalid dateOfBirth');
    }
    return d;
  }

  private nullableTrim(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const t = value.trim();
    return t || null;
  }
}
