import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateShopDto,
  ShopListQueryDto,
  UpdateShopDto,
} from '../auth/dto/shop.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { Shop } from '../database/entities/shop.entity';
import { ActivitiesService } from './activities.service';

@Injectable()
export class ShopsService {
  constructor(
    @InjectRepository(Shop)
    private readonly shopRepo: Repository<Shop>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(dto: CreateShopDto, activity?: ActivityActorContext) {
    const branchCode = dto.branchCode.trim();
    await this.ensureUniqueBranchCode(branchCode);

    const saved = await this.shopRepo.save(
      this.shopRepo.create({
        shopName: dto.shopName.trim(),
        ownerName: dto.ownerName.trim(),
        ownerPhone: dto.ownerPhone.trim(),
        branchCode,
        address: this.nullableTrim(dto.address),
        state: this.nullableTrim(dto.state),
        city: this.nullableTrim(dto.city),
        lat: this.nullableTrim(dto.lat),
        lng: this.nullableTrim(dto.lng),
      }),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Shop',
        entityId: saved.id,
        record: saved.branchCode,
        description: `Created shop ${saved.shopName} (${saved.branchCode})`,
      },
      activity,
    );

    return this.toResponse(saved);
  }

  async findAll(query: ShopListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.shopRepo
      .createQueryBuilder('shop')
      .orderBy('shop.shopName', 'ASC')
      .skip(skip)
      .take(limit);

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          shop.shopName ILIKE :search
          OR shop.ownerName ILIKE :search
          OR shop.ownerPhone ILIKE :search
          OR shop.branchCode ILIKE :search
          OR shop.address ILIKE :search
          OR shop.city ILIKE :search
          OR shop.state ILIKE :search
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
    dto: UpdateShopDto,
    activity?: ActivityActorContext,
  ) {
    const shop = await this.findByIdOrFail(id);

    if (dto.shopName !== undefined) {
      shop.shopName = dto.shopName.trim();
    }
    if (dto.ownerName !== undefined) {
      shop.ownerName = dto.ownerName.trim();
    }
    if (dto.ownerPhone !== undefined) {
      shop.ownerPhone = dto.ownerPhone.trim();
    }
    if (dto.branchCode !== undefined) {
      const branchCode = dto.branchCode.trim();
      await this.ensureUniqueBranchCode(branchCode, id);
      shop.branchCode = branchCode;
    }
    if (dto.address !== undefined) {
      shop.address = this.nullableTrim(dto.address);
    }
    if (dto.state !== undefined) {
      shop.state = this.nullableTrim(dto.state);
    }
    if (dto.city !== undefined) {
      shop.city = this.nullableTrim(dto.city);
    }
    if (dto.lat !== undefined) {
      shop.lat = this.nullableTrim(dto.lat);
    }
    if (dto.lng !== undefined) {
      shop.lng = this.nullableTrim(dto.lng);
    }

    await this.shopRepo.save(shop);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Shop',
        entityId: shop.id,
        record: shop.branchCode,
        description: `Updated shop ${shop.shopName} (${shop.branchCode})`,
      },
      activity,
    );

    return this.findOne(id);
  }

  async remove(id: string, activity?: ActivityActorContext) {
    const shop = await this.findByIdOrFail(id);
    await this.shopRepo.delete(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Shop',
        entityId: shop.id,
        record: shop.branchCode,
        description: `Deleted shop ${shop.shopName} (${shop.branchCode})`,
      },
      activity,
    );

    return { message: 'Shop deleted' };
  }

  /** Dropdown picker — id, label (= shopName), branchCode. */
  async listUtility(opts: { search?: string } = {}) {
    const qb = this.shopRepo
      .createQueryBuilder('shop')
      .select([
        'shop.id',
        'shop.shopName',
        'shop.branchCode',
        'shop.city',
      ])
      .orderBy('shop.shopName', 'ASC');

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere(
        `(shop.shopName ILIKE :search OR shop.branchCode ILIKE :search OR shop.city ILIKE :search)`,
        { search: `%${search}%` },
      );
    }

    const rows = await qb.getMany();
    return {
      data: rows.map((s) => ({
        id: s.id,
        label: s.shopName,
        shopName: s.shopName,
        branchCode: s.branchCode,
        city: s.city,
      })),
    };
  }

  private async findByIdOrFail(id: string) {
    const shop = await this.shopRepo.findOne({ where: { id } });
    if (!shop) {
      throw new NotFoundException('Shop not found');
    }
    return shop;
  }

  private async ensureUniqueBranchCode(branchCode: string, excludeId?: string) {
    const existing = await this.shopRepo
      .createQueryBuilder('shop')
      .where('LOWER(shop.branchCode) = LOWER(:branchCode)', { branchCode })
      .getOne();
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Branch code already exists');
    }
  }

  private nullableTrim(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private toResponse(shop: Shop) {
    return {
      id: shop.id,
      shopName: shop.shopName,
      ownerName: shop.ownerName,
      ownerPhone: shop.ownerPhone,
      branchCode: shop.branchCode,
      address: shop.address,
      state: shop.state,
      city: shop.city,
      lat: shop.lat,
      lng: shop.lng,
      createdAt: shop.createdAt,
      updatedAt: shop.updatedAt,
    };
  }
}
