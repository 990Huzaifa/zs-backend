import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateShiftDto,
  ShiftListQueryDto,
  UpdateShiftDto,
} from '../auth/dto/hr.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { BreakPolicy, Shift, ShiftAssignment } from '../database/entities/hr/shift.entity';
import { ActivitiesService } from './activities.service';

@Injectable()
export class ShiftsService {
  constructor(
    @InjectRepository(Shift)
    private readonly shiftRepo: Repository<Shift>,
    @InjectRepository(BreakPolicy)
    private readonly breakPolicyRepo: Repository<BreakPolicy>,
    @InjectRepository(ShiftAssignment)
    private readonly assignmentRepo: Repository<ShiftAssignment>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(dto: CreateShiftDto, activity?: ActivityActorContext) {
    const name = dto.name.trim();
    await this.ensureUniqueName(name);
    await this.ensureBreakPolicy(dto.breakPolicyId);

    const saved = await this.shiftRepo.save(
      this.shiftRepo.create({
        name,
        startTime: this.normalizeTime(dto.startTime),
        endTime: this.normalizeTime(dto.endTime),
        requiredWorkMinutes: dto.requiredWorkMinutes,
        graceMinutes: dto.graceMinutes ?? 0,
        breakPolicyId: dto.breakPolicyId,
        isActive: dto.isActive ?? true,
      }),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'Shift',
        entityId: saved.id,
        record: saved.name,
        description: `Created shift ${saved.name}`,
      },
      activity,
    );

    return this.findOne(saved.id);
  }

  async findAll(query: ShiftListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.shiftRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.breakPolicy', 'breakPolicy')
      .orderBy('s.name', 'ASC')
      .skip(skip)
      .take(limit);

    const search = query.search?.trim();
    if (search) {
      qb.andWhere('s.name ILIKE :search', { search: `%${search}%` });
    }
    if (query.isActive !== undefined) {
      qb.andWhere('s.isActive = :isActive', { isActive: query.isActive });
    }
    if (query.breakPolicyId) {
      qb.andWhere('s.breakPolicyId = :breakPolicyId', {
        breakPolicyId: query.breakPolicyId,
      });
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
    const shift = await this.shiftRepo.findOne({
      where: { id },
      relations: { breakPolicy: true },
    });
    if (!shift) {
      throw new NotFoundException('Shift not found');
    }
    return this.toResponse(shift);
  }

  async update(
    id: string,
    dto: UpdateShiftDto,
    activity?: ActivityActorContext,
  ) {
    const shift = await this.findByIdOrFail(id);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      await this.ensureUniqueName(name, id);
      shift.name = name;
    }
    if (dto.startTime !== undefined) {
      shift.startTime = this.normalizeTime(dto.startTime);
    }
    if (dto.endTime !== undefined) {
      shift.endTime = this.normalizeTime(dto.endTime);
    }
    if (dto.requiredWorkMinutes !== undefined) {
      shift.requiredWorkMinutes = dto.requiredWorkMinutes;
    }
    if (dto.graceMinutes !== undefined) {
      shift.graceMinutes = dto.graceMinutes;
    }
    if (dto.breakPolicyId !== undefined) {
      await this.ensureBreakPolicy(dto.breakPolicyId);
      shift.breakPolicyId = dto.breakPolicyId;
    }
    if (dto.isActive !== undefined) {
      shift.isActive = dto.isActive;
    }

    await this.shiftRepo.save(shift);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'Shift',
        entityId: shift.id,
        record: shift.name,
        description: `Updated shift ${shift.name}`,
      },
      activity,
    );

    return this.findOne(id);
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const shift = await this.findByIdOrFail(id);

    const assignmentCount = await this.assignmentRepo.count({
      where: { shiftId: id },
    });
    if (assignmentCount > 0) {
      throw new ConflictException(
        'Cannot delete shift with existing assignments',
      );
    }

    await this.shiftRepo.delete(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'Shift',
        entityId: shift.id,
        record: shift.name,
        description: `Deleted shift ${shift.name}`,
      },
      activity,
    );

    return { message: 'Shift deleted' };
  }

  async listUtility(
    opts: { search?: string; isActive?: boolean } = {},
  ) {
    const qb = this.shiftRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.breakPolicy', 'breakPolicy')
      .select([
        's.id',
        's.name',
        's.startTime',
        's.endTime',
        's.isActive',
        's.breakPolicyId',
        'breakPolicy.id',
        'breakPolicy.name',
      ])
      .orderBy('s.name', 'ASC');

    if (opts.isActive !== undefined) {
      qb.andWhere('s.isActive = :isActive', { isActive: opts.isActive });
    } else {
      qb.andWhere('s.isActive = true');
    }

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere('s.name ILIKE :search', { search: `%${search}%` });
    }

    const rows = await qb.getMany();
    return {
      data: rows.map((s) => ({
        id: s.id,
        label: s.name,
        name: s.name,
        startTime: s.startTime,
        endTime: s.endTime,
        isActive: s.isActive,
        breakPolicyId: s.breakPolicyId,
        breakPolicyName: s.breakPolicy?.name ?? null,
      })),
    };
  }

  private async findByIdOrFail(id: string) {
    const shift = await this.shiftRepo.findOne({ where: { id } });
    if (!shift) {
      throw new NotFoundException('Shift not found');
    }
    return shift;
  }

  private async ensureBreakPolicy(breakPolicyId: string) {
    const exists = await this.breakPolicyRepo.exist({
      where: { id: breakPolicyId },
    });
    if (!exists) {
      throw new BadRequestException('Break policy not found');
    }
  }

  private async ensureUniqueName(name: string, excludeId?: string) {
    const existing = await this.shiftRepo
      .createQueryBuilder('s')
      .where('LOWER(s.name) = LOWER(:name)', { name })
      .getOne();
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Shift name already exists');
    }
  }

  private normalizeTime(value: string) {
    const parts = value.trim().split(':');
    if (parts.length === 2) return `${parts[0]}:${parts[1]}:00`;
    return value.trim();
  }

  private toResponse(shift: Shift) {
    return {
      id: shift.id,
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      requiredWorkMinutes: shift.requiredWorkMinutes,
      graceMinutes: shift.graceMinutes,
      breakPolicyId: shift.breakPolicyId,
      breakPolicy: shift.breakPolicy
        ? {
            id: shift.breakPolicy.id,
            name: shift.breakPolicy.name,
            allowedMinutes: shift.breakPolicy.allowedMinutes,
            windowStart: shift.breakPolicy.windowStart,
            windowEnd: shift.breakPolicy.windowEnd,
            allowMultipleBreaks: shift.breakPolicy.allowMultipleBreaks,
            paid: shift.breakPolicy.paid,
            excessDeductible: shift.breakPolicy.excessDeductible,
          }
        : null,
      isActive: shift.isActive,
    };
  }
}
