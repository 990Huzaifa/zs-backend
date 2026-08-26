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
import {
  TaxRule,
  TaxRuleStatus,
} from '../database/entities/tax-rule.entity';

@Injectable()
export class TaxRulesService {
  constructor(
    @InjectRepository(TaxRule)
    private readonly taxRuleRepo: Repository<TaxRule>,
  ) {}

  async create(dto: CreateTaxRuleDto) {
    const code = this.normalizeCode(dto.code);
    await this.ensureUniqueCode(code);
    this.validateDateRange(dto.effectiveFrom, dto.effectiveTo);

    const saved = await this.taxRuleRepo.save(
      this.taxRuleRepo.create({
        name: dto.name.trim(),
        code,
        type: dto.type,
        authority: dto.authority.trim(),
        rate: this.formatRate(dto.rate),
        effectiveFrom: dto.effectiveFrom.slice(0, 10),
        effectiveTo: this.normalizeOptionalDate(dto.effectiveTo),
        status: dto.status ?? TaxRuleStatus.ACTIVE,
      }),
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
          rule.name ILIKE :search
          OR rule.code ILIKE :search
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

  async update(id: string, dto: UpdateTaxRuleDto) {
    const rule = await this.findByIdOrFail(id);

    if (dto.code !== undefined) {
      const code = this.normalizeCode(dto.code);
      if (code !== rule.code) {
        await this.ensureUniqueCode(code, id);
      }
      rule.code = code;
    }

    if (dto.name !== undefined) rule.name = dto.name.trim();
    if (dto.type !== undefined) rule.type = dto.type;
    if (dto.authority !== undefined) rule.authority = dto.authority.trim();
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
    return this.findOne(id);
  }

  async changeStatus(id: string, dto: ChangeTaxRuleStatusDto) {
    const rule = await this.findByIdOrFail(id);
    rule.status = dto.status;
    await this.taxRuleRepo.save(rule);
    return this.findOne(id);
  }

  async remove(id: string) {
    await this.findByIdOrFail(id);

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
      .orderBy('rule.name', 'ASC');

    this.applyDisplayStatusFilter(qb, displayStatus, today);

    const search = options?.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          rule.name ILIKE :search
          OR rule.code ILIKE :search
          OR rule.authority ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    const rows = await qb.getMany();

    return {
      data: rows.map((rule) => ({
        id: rule.id,
        name: rule.name,
        code: rule.code,
        type: rule.type,
        authority: rule.authority,
        rate: rule.rate,
        label: `${rule.code} — ${rule.name} (${rule.rate}%)`,
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
      name: rule.name,
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

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
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

  private async ensureUniqueCode(code: string, excludeId?: string) {
    const existing = await this.taxRuleRepo.findOne({ where: { code } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Tax rule code already exists');
    }
  }

  private todayUtc(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
