import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateDepartmentDto,
  HrListQueryDto,
  UpdateDepartmentDto,
} from '../auth/dto/hr.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { Department } from '../database/entities/hr/employee.entity';
import { ActivitiesService } from './activities.service';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(dto: CreateDepartmentDto, activity?: ActivityActorContext) {
    const name = dto.name.trim();
    await this.ensureUniqueName(name);

    const saved = await this.departmentRepo.save(
      this.departmentRepo.create({ name }),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'Department',
        entityId: saved.id,
        record: saved.name,
        description: `Created department ${saved.name}`,
      },
      activity,
    );

    return this.toResponse(saved);
  }

  async findAll(query: HrListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.departmentRepo
      .createQueryBuilder('d')
      .loadRelationCountAndMap('d.employeeCount', 'd.employees')
      .orderBy('d.name', 'ASC')
      .skip(skip)
      .take(limit);

    const search = query.search?.trim();
    if (search) {
      qb.andWhere('d.name ILIKE :search', { search: `%${search}%` });
    }

    const [rows, total] = await qb.getManyAndCount();

    return {
      data: rows.map((row) =>
        this.toResponse(row, (row as Department & { employeeCount?: number }).employeeCount),
      ),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string) {
    const department = await this.departmentRepo
      .createQueryBuilder('d')
      .loadRelationCountAndMap('d.employeeCount', 'd.employees')
      .where('d.id = :id', { id })
      .getOne();
    if (!department) {
      throw new NotFoundException('Department not found');
    }
    return this.toResponse(
      department,
      (department as Department & { employeeCount?: number }).employeeCount,
    );
  }

  async update(
    id: string,
    dto: UpdateDepartmentDto,
    activity?: ActivityActorContext,
  ) {
    const department = await this.findByIdOrFail(id);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      await this.ensureUniqueName(name, id);
      department.name = name;
    }

    await this.departmentRepo.save(department);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'Department',
        entityId: department.id,
        record: department.name,
        description: `Updated department ${department.name}`,
      },
      activity,
    );

    return this.findOne(id);
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const department = await this.findByIdOrFail(id);

    const employeeCount = await this.departmentRepo
      .createQueryBuilder('d')
      .leftJoin('d.employees', 'e')
      .where('d.id = :id', { id })
      .select('COUNT(e.id)', 'count')
      .getRawOne<{ count: string }>();

    if (Number(employeeCount?.count ?? 0) > 0) {
      throw new ConflictException(
        'Cannot delete department with assigned employees',
      );
    }

    await this.departmentRepo.delete(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'Department',
        entityId: department.id,
        record: department.name,
        description: `Deleted department ${department.name}`,
      },
      activity,
    );

    return { message: 'Department deleted' };
  }

  async listUtility(opts: { search?: string } = {}) {
    const qb = this.departmentRepo
      .createQueryBuilder('d')
      .select(['d.id', 'd.name'])
      .orderBy('d.name', 'ASC');

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere('d.name ILIKE :search', { search: `%${search}%` });
    }

    const rows = await qb.getMany();
    return {
      data: rows.map((d) => ({
        id: d.id,
        label: d.name,
        name: d.name,
      })),
    };
  }

  private async findByIdOrFail(id: string) {
    const department = await this.departmentRepo.findOne({ where: { id } });
    if (!department) {
      throw new NotFoundException('Department not found');
    }
    return department;
  }

  private async ensureUniqueName(name: string, excludeId?: string) {
    const existing = await this.departmentRepo
      .createQueryBuilder('d')
      .where('LOWER(d.name) = LOWER(:name)', { name })
      .getOne();
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Department name already exists');
    }
  }

  private toResponse(department: Department, employeeCount?: number) {
    return {
      id: department.id,
      name: department.name,
      employeeCount: employeeCount ?? 0,
      createdAt: department.createdAt,
      updatedAt: department.updatedAt,
    };
  }
}
