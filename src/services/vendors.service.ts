import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import {
  ChangeVendorStatusDto,
  CreateVendorDto,
  UpdateVendorDto,
  VendorListQueryDto,
} from '../auth/dto/vendor.dto';
import { City } from '../database/entities/city.entity';
import { State } from '../database/entities/state.entity';
import {
  Vendor,
  VendorCategory,
  VendorStatus,
} from '../database/entities/vendor.entity';

@Injectable()
export class VendorsService {
  constructor(
    @InjectRepository(Vendor)
    private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(VendorCategory)
    private readonly categoryRepo: Repository<VendorCategory>,
    @InjectRepository(State)
    private readonly stateRepo: Repository<State>,
    @InjectRepository(City)
    private readonly cityRepo: Repository<City>,
  ) {}

  async create(dto: CreateVendorDto): Promise<Vendor> {
    await this.ensureCategory(dto.vendorCategoryId);
    await this.ensureUniqueEmail(dto.email);
    await this.validateStateAndCity(dto.stateId, dto.cityId);

    const vendor = this.vendorRepo.create({
      vendorCategoryId: dto.vendorCategoryId,
      name: dto.name.trim(),
      email: dto.email.toLowerCase().trim(),
      phone: dto.phone ?? null,
      altPhone: dto.altPhone ?? null,
      bankName: dto.bankName ?? null,
      bankAccountNumber: dto.bankAccountNumber ?? null,
      taxStatus: dto.taxStatus,
      status: dto.status ?? VendorStatus.PENDING,
      address: dto.address ?? null,
      stateId: dto.stateId,
      cityId: dto.cityId,
      zipCode: dto.zipCode ?? null,
      lat: dto.lat ?? null,
      lng: dto.lng ?? null,
    });

    const saved = await this.vendorRepo.save(vendor);
    return this.findByIdOrFail(saved.id);
  }

  async findAll(query: VendorListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<Vendor> = {};

    if (query.status) {
      where.status = query.status;
    }
    if (query.taxStatus) {
      where.taxStatus = query.taxStatus;
    }
    if (query.vendorCategoryId) {
      where.vendorCategoryId = query.vendorCategoryId;
    }
    if (query.stateId !== undefined) {
      where.stateId = query.stateId;
    }
    if (query.cityId !== undefined) {
      where.cityId = query.cityId;
    }

    const search = query.search?.trim();
    const whereClause: FindOptionsWhere<Vendor>[] | FindOptionsWhere<Vendor> =
      search
        ? [
            { ...where, name: ILike(`%${search}%`) },
            { ...where, email: ILike(`%${search}%`) },
            { ...where, phone: ILike(`%${search}%`) },
          ]
        : where;

    const [data, total] = await this.vendorRepo.findAndCount({
      where: whereClause,
      relations: {
        vendorCategory: true,
        state: true,
        city: true,
      },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string): Promise<Vendor> {
    return this.findByIdOrFail(id);
  }

  async update(id: string, dto: UpdateVendorDto): Promise<Vendor> {
    const vendor = await this.findByIdOrFail(id);

    if (dto.vendorCategoryId) {
      await this.ensureCategory(dto.vendorCategoryId);
      vendor.vendorCategoryId = dto.vendorCategoryId;
    }

    if (dto.email !== undefined) {
      const email = dto.email.toLowerCase().trim();
      if (email !== vendor.email) {
        await this.ensureUniqueEmail(email, id);
      }
      vendor.email = email;
    }

    const nextStateId =
      dto.stateId !== undefined ? dto.stateId : vendor.stateId;
    const nextCityId = dto.cityId !== undefined ? dto.cityId : vendor.cityId;
    await this.validateStateAndCity(nextStateId, nextCityId);

    if (dto.name !== undefined) vendor.name = dto.name.trim();
    if (dto.phone !== undefined) vendor.phone = dto.phone;
    if (dto.altPhone !== undefined) vendor.altPhone = dto.altPhone;
    if (dto.bankName !== undefined) vendor.bankName = dto.bankName;
    if (dto.bankAccountNumber !== undefined) {
      vendor.bankAccountNumber = dto.bankAccountNumber;
    }
    if (dto.taxStatus !== undefined) vendor.taxStatus = dto.taxStatus;
    if (dto.address !== undefined) vendor.address = dto.address;
    if (dto.stateId !== undefined) vendor.stateId = dto.stateId;
    if (dto.cityId !== undefined) vendor.cityId = dto.cityId;
    if (dto.zipCode !== undefined) vendor.zipCode = dto.zipCode;
    if (dto.lat !== undefined) vendor.lat = dto.lat;
    if (dto.lng !== undefined) vendor.lng = dto.lng;

    await this.vendorRepo.save(vendor);
    return this.findByIdOrFail(id);
  }

  async changeStatus(
    id: string,
    dto: ChangeVendorStatusDto,
  ): Promise<Vendor> {
    const vendor = await this.findByIdOrFail(id);
    vendor.status = dto.status;
    await this.vendorRepo.save(vendor);
    return this.findByIdOrFail(id);
  }

  private async findByIdOrFail(id: string): Promise<Vendor> {
    const vendor = await this.vendorRepo.findOne({
      where: { id },
      relations: {
        vendorCategory: true,
        state: true,
        city: true,
      },
    });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }
    return vendor;
  }

  private async ensureCategory(categoryId: string): Promise<void> {
    const category = await this.categoryRepo.findOne({
      where: { id: categoryId },
    });
    if (!category) {
      throw new NotFoundException('Vendor category not found');
    }
  }

  private async ensureUniqueEmail(
    email: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.vendorRepo.findOne({
      where: { email: email.toLowerCase().trim() },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Vendor email already exists');
    }
  }

  private async validateStateAndCity(
    stateId: number,
    cityId: number,
  ): Promise<void> {
    const state = await this.stateRepo.findOne({
      where: { id: stateId as unknown as string },
    });
    if (!state) {
      throw new NotFoundException('State not found');
    }

    const city = await this.cityRepo.findOne({
      where: { id: cityId as unknown as string },
    });
    if (!city) {
      throw new NotFoundException('City not found');
    }
    if (Number(city.stateId) !== Number(stateId)) {
      throw new BadRequestException(
        'City does not belong to the selected state',
      );
    }
  }
}
