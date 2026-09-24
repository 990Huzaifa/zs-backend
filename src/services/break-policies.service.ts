import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateBreakPolicyDto,
  HrListQueryDto,
  UpdateBreakPolicyDto,
} from '../auth/dto/hr.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { BreakPolicy, Shift } from '../database/entities/hr/shift.entity';
import { ActivitiesService } from './activities.service';

@Injectable()
export class BreakPoliciesService {
  constructor(
    @InjectRepository(BreakPolicy)
    private readonly breakPolicyRepo: Repository<BreakPolicy>,
    @InjectRepository(Shift)
    private readonly shiftRepo: Repository<Shift>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(dto: CreateBreakPolicyDto, activity?: ActivityActorContext) {
    const name = dto.name.trim();
    await this.ensureUniqueName(name);

    const saved = await this.breakPolicyRepo.save(
      this.breakPolicyRepo.create({
        name,
        allowedMinutes: dto.allowedMinutes,
        windowStart: this.normalizeTime(dto.windowStart),
        windowEnd: this.normalizeTime(dto.windowEnd),
        allowMultipleBreaks: dto.allowMultipleBreaks ?? true,
        paid: dto.paid ?? true,
        excessDeductible: dto.excessDeductible ?? true,
      }),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'BreakPolicy',
        entityId: saved.id,
        record: saved.name,
        description: `Created break policy ${saved.name}`,
      },
      activity,
    );

    return this.toResponse(saved);
  }

  async findAll(query: HrListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.breakPolicyRepo
      .createQueryBuilder('bp')
      .orderBy('bp.name', 'ASC')
      .skip(skip)
      .take(limit);

    const search = query.search?.trim();
    if (search) {
      qb.andWhere('bp.name ILIKE :search', { search: `%${search}%` });
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
    dto: UpdateBreakPolicyDto,
    activity?: ActivityActorContext,
  ) {
    const policy = await this.findByIdOrFail(id);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      await this.ensureUniqueName(name, id);
      policy.name = name;
    }
    if (dto.allowedMinutes !== undefined) {
      policy.allowedMinutes = dto.allowedMinutes;
    }
    if (dto.windowStart !== undefined) {
      policy.windowStart = this.normalizeTime(dto.windowStart);
    }
    if (dto.windowEnd !== undefined) {
      policy.windowEnd = this.normalizeTime(dto.windowEnd);
    }
    if (dto.allowMultipleBreaks !== undefined) {
      policy.allowMultipleBreaks = dto.allowMultipleBreaks;
    }
    if (dto.paid !== undefined) {
      policy.paid = dto.paid;
    }
    if (dto.excessDeductible !== undefined) {
      policy.excessDeductible = dto.excessDeductible;
    }

    await this.breakPolicyRepo.save(policy);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'BreakPolicy',
        entityId: policy.id,
        record: policy.name,
        description: `Updated break policy ${policy.name}`,
      },
      activity,
    );

    return this.toResponse(policy);
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const policy = await this.findByIdOrFail(id);

    const shiftCount = await this.shiftRepo.count({
      where: { breakPolicyId: id },
    });
    if (shiftCount > 0) {
      throw new ConflictException(
        'Cannot delete break policy linked to shifts',
      );
    }

    await this.breakPolicyRepo.delete(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'BreakPolicy',
        entityId: policy.id,
        record: policy.name,
        description: `Deleted break policy ${policy.name}`,
      },
      activity,
    );

    return { message: 'Break policy deleted' };
  }

  async listUtility(opts: { search?: string } = {}) {
    const qb = this.breakPolicyRepo
      .createQueryBuilder('bp')
      .select([
        'bp.id',
        'bp.name',
        'bp.allowedMinutes',
        'bp.windowStart',
        'bp.windowEnd',
      ])
      .orderBy('bp.name', 'ASC');

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere('bp.name ILIKE :search', { search: `%${search}%` });
    }

    const rows = await qb.getMany();
    return {
      data: rows.map((bp) => ({
        id: bp.id,
        label: bp.name,
        name: bp.name,
        allowedMinutes: bp.allowedMinutes,
        windowStart: bp.windowStart,
        windowEnd: bp.windowEnd,
      })),
    };
  }

  private async findByIdOrFail(id: string) {
    const policy = await this.breakPolicyRepo.findOne({ where: { id } });
    if (!policy) {
      throw new NotFoundException('Break policy not found');
    }
    return policy;
  }

  private async ensureUniqueName(name: string, excludeId?: string) {
    const existing = await this.breakPolicyRepo
      .createQueryBuilder('bp')
      .where('LOWER(bp.name) = LOWER(:name)', { name })
      .getOne();
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Break policy name already exists');
    }
  }

  private normalizeTime(value: string) {
    const parts = value.trim().split(':');
    if (parts.length === 2) return `${parts[0]}:${parts[1]}:00`;
    return value.trim();
  }

  private toResponse(policy: BreakPolicy) {
    return {
      id: policy.id,
      name: policy.name,
      allowedMinutes: policy.allowedMinutes,
      windowStart: policy.windowStart,
      windowEnd: policy.windowEnd,
      allowMultipleBreaks: policy.allowMultipleBreaks,
      paid: policy.paid,
      excessDeductible: policy.excessDeductible,
    };
  }
}
