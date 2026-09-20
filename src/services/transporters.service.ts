import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateTransporterDto,
  TransporterListQueryDto,
  UpdateTransporterDto,
} from '../auth/dto/transporter.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { Transporter } from '../database/entities/transporter.entity';
import { ActivitiesService } from './activities.service';

@Injectable()
export class TransportersService {
  constructor(
    @InjectRepository(Transporter)
    private readonly transporterRepo: Repository<Transporter>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(dto: CreateTransporterDto, activity?: ActivityActorContext) {
    const fullName = dto.fullName.trim();
    const phoneNumber = dto.phoneNumber.trim();
    const email = this.nullableEmail(dto.email);

    await this.ensureUniquePhone(phoneNumber);

    const saved = await this.transporterRepo.save(
      this.transporterRepo.create({
        fullName,
        phoneNumber,
        email,
      }),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Transporter',
        entityId: saved.id,
        record: saved.fullName,
        description: `Created transporter ${saved.fullName}`,
      },
      activity,
    );

    return this.toResponse(saved);
  }

  async findAll(query: TransporterListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.transporterRepo
      .createQueryBuilder('t')
      .orderBy('t.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          t.fullName ILIKE :search
          OR t.phoneNumber ILIKE :search
          OR t.email ILIKE :search
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
    dto: UpdateTransporterDto,
    activity?: ActivityActorContext,
  ) {
    const transporter = await this.findByIdOrFail(id);

    if (dto.fullName !== undefined) {
      transporter.fullName = dto.fullName.trim();
    }
    if (dto.email !== undefined) {
      transporter.email = this.nullableEmail(dto.email);
    }
    if (dto.phoneNumber !== undefined) {
      const phoneNumber = dto.phoneNumber.trim();
      await this.ensureUniquePhone(phoneNumber, id);
      transporter.phoneNumber = phoneNumber;
    }

    await this.transporterRepo.save(transporter);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Transporter',
        entityId: transporter.id,
        record: transporter.fullName,
        description: `Updated transporter ${transporter.fullName}`,
      },
      activity,
    );

    return this.toResponse(transporter);
  }

  async remove(
    id: string,
    activity?: ActivityActorContext,
  ): Promise<{ message: string }> {
    const transporter = await this.findByIdOrFail(id);
    await this.transporterRepo.delete(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Transporter',
        entityId: transporter.id,
        record: transporter.fullName,
        description: `Deleted transporter ${transporter.fullName}`,
      },
      activity,
    );

    return { message: 'Transporter deleted' };
  }

  /** Lightweight dropdown — no pagination. */
  async listUtility(opts: { search?: string } = {}) {
    const qb = this.transporterRepo
      .createQueryBuilder('t')
      .select(['t.id', 't.fullName', 't.email', 't.phoneNumber'])
      .orderBy('t.fullName', 'ASC');

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          t.fullName ILIKE :search
          OR t.phoneNumber ILIKE :search
          OR t.email ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    const rows = await qb.getMany();
    return {
      data: rows.map((t) => ({
        id: t.id,
        label: t.fullName,
        fullName: t.fullName,
        email: t.email ?? null,
        phoneNumber: t.phoneNumber,
      })),
    };
  }

  private async findByIdOrFail(id: string): Promise<Transporter> {
    const transporter = await this.transporterRepo.findOne({ where: { id } });
    if (!transporter) {
      throw new NotFoundException('Transporter not found');
    }
    return transporter;
  }

  private async ensureUniquePhone(phoneNumber: string, excludeId?: string) {
    const existing = await this.transporterRepo.findOne({
      where: { phoneNumber },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Transporter phone number already exists');
    }
  }

  private nullableEmail(value?: string | null): string | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    return value.trim().toLowerCase();
  }

  private toResponse(transporter: Transporter) {
    return {
      id: transporter.id,
      fullName: transporter.fullName,
      email: transporter.email ?? null,
      phoneNumber: transporter.phoneNumber,
      createdAt: transporter.createdAt,
      updatedAt: transporter.updatedAt,
    };
  }
}
