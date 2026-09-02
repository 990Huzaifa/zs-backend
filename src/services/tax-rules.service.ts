import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ChangeTaxRuleStatusDto,
  CreateTaxRuleDto,
  TaxRuleDisplayStatus,
  TaxRuleListQueryDto,
  UpdateTaxRuleDto,
} from '../auth/dto/tax-rule.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import {
  TaxRule,
  TaxRuleStatus,
  TaxRuleType,
} from '../database/entities/tax-rule.entity';
import { ActivitiesService } from './activities.service';

@Injectable()
export class TaxRulesService {
  constructor(
    @InjectRepository(TaxRule)
    private readonly taxRuleRepo: Repository<TaxRule>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(dto: CreateTaxRuleDto, activity?: ActivityActorContext) {
    const authority = dto.authority.trim();
    this.validateDateRange(dto.effectiveFrom, dto.effectiveTo);

    const code = await this.generateUniqueCode(dto.type, authority);

    const saved = await this.taxRuleRepo.save(
      this.taxRuleRepo.create({
        code,
        type: dto.type,
        authority,
        rate: this.formatRate(dto.rate),
        effectiveFrom: dto.effectiveFrom.slice(0, 10),
        effectiveTo: this.normalizeOptionalDate(dto.effectiveTo),
        status: dto.status ?? TaxRuleStatus.ACTIVE,
      }),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.FINANCE,
        entityType: 'TaxRule',
        entityId: saved.id,
        record: saved.code,
        description: `Created tax rule ${saved.code}`,
      },
      activity,
    );

    return this.toResponse(saved);
  }

  async findAll(query: TaxRuleListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;
    const today = this.todayUtc();

    const qb = this.taxRuleRepo
      .createQueryBuilder('rule')
      .orderBy('rule.createdAt', 'DESC');

    if (query.type) {
      qb.andWhere('rule.type = :type', { type: query.type });
    }
    if (query.authority?.trim()) {
      qb.andWhere('rule.authority ILIKE :authority', {
        authority: `%${query.authority.trim()}%`,
      });
    }
    if (query.status) {
      qb.andWhere('rule.status = :status', { status: query.status });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          rule.code ILIKE :search
          OR rule.authority ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    if (query.displayStatus) {
      this.applyDisplayStatusFilter(qb, query.displayStatus, today);
    }

    const [rows, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return {
      data: rows.map((row) => this.toResponse(row, today)),
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
    dto: UpdateTaxRuleDto,
    activity?: ActivityActorContext,
  ) {
    const rule = await this.findByIdOrFail(id);

    const nextType = dto.type ?? rule.type;
    const nextAuthority =
      dto.authority !== undefined ? dto.authority.trim() : rule.authority;

    if (dto.type !== undefined || dto.authority !== undefined) {
      const nextCode = await this.generateUniqueCode(
        nextType,
        nextAuthority,
        id,
      );
      rule.code = nextCode;
    }

    if (dto.type !== undefined) rule.type = dto.type;
    if (dto.authority !== undefined) rule.authority = nextAuthority;
    if (dto.rate !== undefined) rule.rate = this.formatRate(dto.rate);
    if (dto.effectiveFrom !== undefined) {
      rule.effectiveFrom = dto.effectiveFrom.slice(0, 10);
    }
    if (dto.effectiveTo !== undefined) {
      rule.effectiveTo = this.normalizeOptionalDate(dto.effectiveTo);
    }
    if (dto.status !== undefined) rule.status = dto.status;

    this.validateDateRange(rule.effectiveFrom, rule.effectiveTo);

    await this.taxRuleRepo.save(rule);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.FINANCE,
        entityType: 'TaxRule',
        entityId: id,
        record: rule.code,
        description: `Updated tax rule ${rule.code}`,
      },
      activity,
    );

    return this.findOne(id);
  }

  async changeStatus(
    id: string,
    dto: ChangeTaxRuleStatusDto,
    activity?: ActivityActorContext,
  ) {
    const rule = await this.findByIdOrFail(id);
    rule.status = dto.status;
    await this.taxRuleRepo.save(rule);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.FINANCE,
        entityType: 'TaxRule',
        entityId: id,
        record: rule.code,
        description: `Changed tax rule status to ${dto.status}`,
        metadata: { status: dto.status },
      },
      activity,
    );

    return this.findOne(id);
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const rule = await this.findByIdOrFail(id);

    const linked = await this.taxRuleRepo
      .createQueryBuilder('rule')
      .innerJoin('rule.clients', 'client')
      .where('rule.id = :id', { id })
      .getCount();

    if (linked > 0) {
      throw new BadRequestException(
        'Cannot delete tax rule that is linked to clients',
      );
    }

    await this.taxRuleRepo.delete(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.FINANCE,
        entityType: 'TaxRule',
        entityId: id,
        record: rule.code,
        description: `Deleted tax rule ${rule.code}`,
      },
      activity,
    );

    return { message: 'Tax rule deleted' };
  }

  /**
   * Lightweight options for client create/edit multi-select.
   * Only manually ACTIVE rules; optionally filter by displayStatus (default ACTIVE).
   */
  async listSaleTaxUtility(options?: {
    search?: string;
    displayStatus?: TaxRuleDisplayStatus;
  }) {
    const today = this.todayUtc();
    const displayStatus = options?.displayStatus ?? 'ACTIVE';

    const qb = this.taxRuleRepo
      .createQueryBuilder('rule')
      .where('rule.status = :status', { status: TaxRuleStatus.ACTIVE })
      .orderBy('rule.code', 'ASC');

    this.applyDisplayStatusFilter(qb, displayStatus, today);

    const search = options?.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          rule.code ILIKE :search
          OR rule.authority ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    const rows = await qb.getMany();

    return {
      data: rows.map((rule) => ({
        id: rule.id,
        code: rule.code,
        type: rule.type,
        authority: rule.authority,
        rate: rule.rate,
        label: `${rule.code} — ${rule.authority} (${rule.rate}%)`,
        displayStatus: this.resolveDisplayStatus(rule, today),
      })),
    };
  }

  private applyDisplayStatusFilter(
    qb: ReturnType<Repository<TaxRule>['createQueryBuilder']>,
    displayStatus: TaxRuleDisplayStatus,
    today: string,
  ) {
    switch (displayStatus) {
      case 'INACTIVE':
        qb.andWhere('rule.status = :dsStatus', {
          dsStatus: TaxRuleStatus.INACTIVE,
        });
        break;
      case 'EXPIRED':
        qb.andWhere('rule.status = :dsActive', {
          dsActive: TaxRuleStatus.ACTIVE,
        });
        qb.andWhere('rule.effectiveTo IS NOT NULL');
        qb.andWhere('rule.effectiveTo < :today', { today });
        break;
      case 'UPCOMING':
        qb.andWhere('rule.status = :dsActive', {
          dsActive: TaxRuleStatus.ACTIVE,
        });
        qb.andWhere('rule.effectiveFrom > :today', { today });
        break;
      case 'ACTIVE':
        qb.andWhere('rule.status = :dsActive', {
          dsActive: TaxRuleStatus.ACTIVE,
        });
        qb.andWhere('rule.effectiveFrom <= :today', { today });
        qb.andWhere(
          '(rule.effectiveTo IS NULL OR rule.effectiveTo >= :today)',
          { today },
        );
        break;
    }
  }

  private resolveDisplayStatus(
    rule: TaxRule,
    today = this.todayUtc(),
  ): TaxRuleDisplayStatus {
    if (rule.status === TaxRuleStatus.INACTIVE) return 'INACTIVE';
    const from = String(rule.effectiveFrom).slice(0, 10);
    const to = rule.effectiveTo
      ? String(rule.effectiveTo).slice(0, 10)
      : null;
    if (to && to < today) return 'EXPIRED';
    if (from > today) return 'UPCOMING';
    return 'ACTIVE';
  }

  private toResponse(rule: TaxRule, today = this.todayUtc()) {
    return {
      id: rule.id,
      code: rule.code,
      type: rule.type,
      authority: rule.authority,
      rate: rule.rate,
      effectiveFrom: String(rule.effectiveFrom).slice(0, 10),
      effectiveTo: rule.effectiveTo
        ? String(rule.effectiveTo).slice(0, 10)
        : null,
      status: rule.status,
      displayStatus: this.resolveDisplayStatus(rule, today),
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }

  private async findByIdOrFail(id: string): Promise<TaxRule> {
    const rule = await this.taxRuleRepo.findOne({ where: { id } });
    if (!rule) {
      throw new NotFoundException('Tax rule not found');
    }
    return rule;
  }

  /**
   * Format: {first letter of each word from type}-{authority}
   * e.g. SALES_TAX + "FBR" → ST-FBR
   *      WITH_HOLDING_TAX + "Federal Board" → WHT-FEDERAL BOARD
   */
  private buildCode(type: TaxRuleType, authority: string): string {
    const typePrefix = type
      .split('_')
      .filter(Boolean)
      .map((word) => word.charAt(0))
      .join('')
      .toUpperCase();

    const authorityPart = authority.trim().toUpperCase();
    return `${typePrefix}-${authorityPart}`;
  }

  private async generateUniqueCode(
    type: TaxRuleType,
    authority: string,
    excludeId?: string,
  ): Promise<string> {
    const baseCode = this.buildCode(type, authority);
    let code = baseCode;
    let suffix = 2;

    while (true) {
      const existing = await this.taxRuleRepo.findOne({ where: { code } });
      if (!existing || existing.id === excludeId) {
        return code;
      }
      code = `${baseCode}-${suffix}`;
      suffix += 1;

      if (suffix > 99) {
        throw new ConflictException('Could not generate unique tax rule code');
      }
    }
  }

  private formatRate(rate: number): string {
    return rate.toFixed(4);
  }

  private normalizeOptionalDate(
    value?: string | null,
  ): string | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    return value.slice(0, 10);
  }

  private validateDateRange(
    effectiveFrom: string,
    effectiveTo?: string | null,
  ) {
    const from = effectiveFrom.slice(0, 10);
    const to = effectiveTo ? effectiveTo.slice(0, 10) : null;
    if (to && to < from) {
      throw new BadRequestException(
        'effectiveTo must be on or after effectiveFrom',
      );
    }
  }

  private todayUtc(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
