import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, ILike, Repository } from 'typeorm';
import {
  ChangeVendorStatusDto,
  CreateVendorContactDto,
  CreateVendorDto,
  UpdateVendorContactDto,
  UpdateVendorDto,
  VendorListQueryDto,
} from '../auth/dto/vendor.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import { COA_PARENT_CODES } from '../database/chart-of-accounts/constants/coa-parent-codes';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { ChartOfAccountKind } from '../database/entities/chart-of-account.entity';
import { City } from '../database/entities/city.entity';
import { State } from '../database/entities/state.entity';
import {
  Vendor,
  VendorCategory,
  VendorContact,
  VendorStatus,
} from '../database/entities/vendor.entity';
import { ActivitiesService } from './activities.service';
import { ChartOfAccountsService } from './chart-of-accounts.service';

@Injectable()
export class VendorsService {
  constructor(
    @InjectRepository(Vendor)
    private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(VendorCategory)
    private readonly categoryRepo: Repository<VendorCategory>,
    @InjectRepository(VendorContact)
    private readonly contactRepo: Repository<VendorContact>,
    @InjectRepository(State)
    private readonly stateRepo: Repository<State>,
    @InjectRepository(City)
    private readonly cityRepo: Repository<City>,
    private readonly dataSource: DataSource,
    private readonly chartOfAccountsService: ChartOfAccountsService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(
    dto: CreateVendorDto,
    activity?: ActivityActorContext,
  ): Promise<Vendor> {
    await this.ensureCategory(dto.vendorCategoryId);
    const email = this.normalizeEmail(dto.email);
    if (email) {
      await this.ensureUniqueEmail(email);
    }
    await this.validateStateAndCity(dto.stateId, dto.cityId);

    const ownerName = dto.ownerName.trim();
    const vendorName = dto.vendorName?.trim() || null;
    const displayName = this.getDisplayName(ownerName, vendorName);

    const savedId = await this.dataSource.transaction(async (manager) => {
      const vendor = await manager.save(
        manager.create(Vendor, {
          vendorCategoryId: dto.vendorCategoryId,
          joiningDate: dto.joiningDate ? new Date(dto.joiningDate) : null,
          ownerName,
          vendorName,
          email,
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
        }),
      );

      await this.chartOfAccountsService.createLinkedLeaf(
        {
          parentCode: COA_PARENT_CODES.VENDOR_PAYABLES,
          name: displayName,
          userId: null,
          accountKind: ChartOfAccountKind.PARTY_PAYABLE,
        },
        manager,
      );

      return vendor.id;
    });

    const vendor = await this.findByIdOrFail(savedId);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Vendor',
        entityId: vendor.id,
        record: displayName,
        description: `Created vendor ${displayName}`,
        metadata: {
          vendorCategoryId: vendor.vendorCategoryId,
          status: vendor.status,
          taxStatus: vendor.taxStatus,
        },
      },
      activity,
    );

    return vendor;
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
            { ...where, ownerName: ILike(`%${search}%`) },
            { ...where, vendorName: ILike(`%${search}%`) },
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
    return this.findByIdOrFail(id, true);
  }

  /**
   * Lightweight vendor dropdown (trip expenses).
   * Filter by category first, then pick vendor.
   */
  async listUtility(opts: {
    vendorCategoryId?: string;
    search?: string;
    status?: VendorStatus;
  }) {
    const qb = this.vendorRepo
      .createQueryBuilder('vendor')
      .leftJoin('vendor.vendorCategory', 'category')
      .select([
        'vendor.id',
        'vendor.ownerName',
        'vendor.vendorName',
        'vendor.status',
        'vendor.vendorCategoryId',
        'category.id',
        'category.name',
        'category.slug',
      ])
      .orderBy('vendor.vendorName', 'ASC')
      .addOrderBy('vendor.ownerName', 'ASC');

    if (opts.vendorCategoryId) {
      qb.andWhere('vendor.vendorCategoryId = :vendorCategoryId', {
        vendorCategoryId: opts.vendorCategoryId,
      });
    }

    qb.andWhere('vendor.status = :status', {
      status: opts.status ?? VendorStatus.ACTIVE,
    });

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          vendor.ownerName ILIKE :search
          OR vendor.vendorName ILIKE :search
          OR vendor.phone ILIKE :search
          OR vendor.email ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    const rows = await qb.getMany();
    return {
      data: rows.map((v) => ({
        id: v.id,
        label: this.getDisplayName(v.ownerName, v.vendorName),
        ownerName: v.ownerName,
        vendorName: v.vendorName ?? null,
        status: v.status,
        vendorCategoryId: v.vendorCategoryId,
        vendorCategory: v.vendorCategory
          ? {
              id: v.vendorCategory.id,
              name: v.vendorCategory.name,
              slug: v.vendorCategory.slug,
            }
          : null,
      })),
    };
  }

  async update(
    id: string,
    dto: UpdateVendorDto,
    activity?: ActivityActorContext,
  ): Promise<Vendor> {
    const vendor = await this.findByIdOrFail(id);
    const previousDisplayName = this.getDisplayName(
      vendor.ownerName,
      vendor.vendorName,
    );

    if (dto.vendorCategoryId) {
      await this.ensureCategory(dto.vendorCategoryId);
      vendor.vendorCategoryId = dto.vendorCategoryId;
    }

    if (dto.email !== undefined) {
      const email = this.normalizeEmail(dto.email);
      if (email && email !== vendor.email) {
        await this.ensureUniqueEmail(email, id);
      }
      vendor.email = email;
    }

    const nextStateId =
      dto.stateId !== undefined ? dto.stateId : vendor.stateId;
    const nextCityId = dto.cityId !== undefined ? dto.cityId : vendor.cityId;
    await this.validateStateAndCity(nextStateId, nextCityId);

    if (dto.joiningDate !== undefined) {
      vendor.joiningDate = dto.joiningDate ? new Date(dto.joiningDate) : null;
    }
    if (dto.ownerName !== undefined) vendor.ownerName = dto.ownerName.trim();
    if (dto.vendorName !== undefined) {
      vendor.vendorName = dto.vendorName?.trim() || null;
    }
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

    const nextDisplayName = this.getDisplayName(
      vendor.ownerName,
      vendor.vendorName,
    );

    // Keep Vendor Payables leaf in sync (create if legacy vendor had none)
    await this.chartOfAccountsService.syncLinkedLeafName(
      COA_PARENT_CODES.VENDOR_PAYABLES,
      previousDisplayName,
      nextDisplayName,
      ChartOfAccountKind.PARTY_PAYABLE,
    );

    const updated = await this.findByIdOrFail(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Vendor',
        entityId: updated.id,
        record: nextDisplayName,
        description: `Updated vendor ${nextDisplayName}`,
        metadata: {
          previousName: previousDisplayName,
          vendorCategoryId: updated.vendorCategoryId,
          status: updated.status,
        },
      },
      activity,
    );

    return updated;
  }

  async changeStatus(
    id: string,
    dto: ChangeVendorStatusDto,
    activity?: ActivityActorContext,
  ): Promise<Vendor> {
    const vendor = await this.findByIdOrFail(id);
    const previousStatus = vendor.status;
    vendor.status = dto.status;
    await this.vendorRepo.save(vendor);
    const updated = await this.findByIdOrFail(id);
    const displayName = this.getDisplayName(
      updated.ownerName,
      updated.vendorName,
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Vendor',
        entityId: updated.id,
        record: displayName,
        description: `Changed vendor ${displayName} status to ${updated.status}`,
        metadata: {
          previousStatus,
          status: updated.status,
        },
      },
      activity,
    );

    return updated;
  }

  // ── Contacts ──────────────────────────────────────────────

  async listContacts(vendorId: string) {
    await this.ensureVendorExists(vendorId);
    return this.contactRepo.find({
      where: { vendorId },
      order: { createdAt: 'DESC' },
    });
  }

  async findContact(vendorId: string, contactId: string) {
    return this.findContactOrFail(vendorId, contactId);
  }

  async createContact(
    vendorId: string,
    dto: CreateVendorContactDto,
    activity?: ActivityActorContext,
  ) {
    await this.ensureVendorExists(vendorId);
    const email = this.normalizeEmail(dto.email);
    if (email) {
      await this.ensureUniqueContactEmail(vendorId, email);
    }

    const contact = await this.contactRepo.save(
      this.contactRepo.create({
        vendorId,
        name: dto.name.trim(),
        designation: dto.designation.trim(),
        address: dto.address?.trim() || null,
        email,
        phone: dto.phone.trim(),
      }),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'VendorContact',
        entityId: contact.id,
        record: contact.name,
        description: `Created vendor contact ${contact.name}`,
        metadata: { vendorId },
      },
      activity,
    );

    return contact;
  }

  async updateContact(
    vendorId: string,
    contactId: string,
    dto: UpdateVendorContactDto,
    activity?: ActivityActorContext,
  ) {
    const contact = await this.findContactOrFail(vendorId, contactId);

    if (dto.email !== undefined) {
      const email = this.normalizeEmail(dto.email);
      if (email && email !== contact.email) {
        await this.ensureUniqueContactEmail(vendorId, email, contactId);
      }
      contact.email = email;
    }
    if (dto.name !== undefined) contact.name = dto.name.trim();
    if (dto.designation !== undefined) {
      contact.designation = dto.designation.trim();
    }
    if (dto.address !== undefined) {
      contact.address = dto.address?.trim() || null;
    }
    if (dto.phone !== undefined) contact.phone = dto.phone.trim();

    const saved = await this.contactRepo.save(contact);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'VendorContact',
        entityId: saved.id,
        record: saved.name,
        description: `Updated vendor contact ${saved.name}`,
        metadata: { vendorId },
      },
      activity,
    );

    return saved;
  }

  async removeContact(
    vendorId: string,
    contactId: string,
    activity?: ActivityActorContext,
  ) {
    const contact = await this.findContactOrFail(vendorId, contactId);
    await this.contactRepo.delete({ id: contactId, vendorId });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'VendorContact',
        entityId: contactId,
        record: contact.name,
        description: `Deleted vendor contact ${contact.name}`,
        metadata: { vendorId },
      },
      activity,
    );

    return { message: 'Vendor contact deleted' };
  }

  private async findByIdOrFail(
    id: string,
    withContacts = false,
  ): Promise<Vendor> {
    const vendor = await this.vendorRepo.findOne({
      where: { id },
      relations: {
        vendorCategory: true,
        state: true,
        city: true,
        ...(withContacts ? { contacts: true } : {}),
      },
    });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }
    return vendor;
  }

  private async ensureVendorExists(vendorId: string): Promise<void> {
    const exists = await this.vendorRepo.exist({ where: { id: vendorId } });
    if (!exists) {
      throw new NotFoundException('Vendor not found');
    }
  }

  private async ensureCategory(categoryId: string): Promise<void> {
    const category = await this.categoryRepo.findOne({
      where: { id: categoryId },
    });
    if (!category) {
      throw new NotFoundException('Vendor category not found');
    }
  }

  private getDisplayName(
    ownerName: string,
    vendorName?: string | null,
  ): string {
    const trimmedVendor = vendorName?.trim();
    return trimmedVendor || ownerName;
  }

  private normalizeEmail(email?: string | null): string | null {
    if (email === undefined || email === null || email.trim() === '') {
      return null;
    }
    return email.toLowerCase().trim();
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

  private async ensureUniqueContactEmail(
    vendorId: string,
    email: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.contactRepo.findOne({
      where: { vendorId, email },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        'Contact email already exists for this vendor',
      );
    }
  }

  private async findContactOrFail(vendorId: string, contactId: string) {
    const contact = await this.contactRepo.findOne({
      where: { id: contactId, vendorId },
    });
    if (!contact) {
      throw new NotFoundException('Vendor contact not found');
    }
    return contact;
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
