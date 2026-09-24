import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, FindOptionsWhere, ILike, Repository } from 'typeorm';
import {
  ChangeBrokerStatusDto,
  CreateBrokerContactDto,
  CreateBrokerDto,
  BrokerListQueryDto,
  UpdateBrokerContactDto,
  UpdateBrokerDto,
  UploadBrokerDocumentDto,
} from '../auth/dto/broker.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import { S3Service } from '../common/s3/s3.service';
import { COA_PARENT_CODES } from '../database/chart-of-accounts/constants/coa-parent-codes';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import {
  ChartOfAccount,
  ChartOfAccountKind,
} from '../database/entities/chart-of-account.entity';
import { City } from '../database/entities/city.entity';
import { State } from '../database/entities/state.entity';
import {
  Broker,
  BrokerContact,
  BrokerDocument,
  BrokerStatus,
} from '../database/entities/broker.entity';
import { Transaction } from '../database/entities/transaction.entity';
import { ActivitiesService } from './activities.service';
import { ChartOfAccountsService } from './chart-of-accounts.service';

@Injectable()
export class BrokersService {
  constructor(
    @InjectRepository(Broker)
    private readonly brokerRepo: Repository<Broker>,
    @InjectRepository(BrokerContact)
    private readonly contactRepo: Repository<BrokerContact>,
    @InjectRepository(BrokerDocument)
    private readonly documentRepo: Repository<BrokerDocument>,
    @InjectRepository(State)
    private readonly stateRepo: Repository<State>,
    @InjectRepository(City)
    private readonly cityRepo: Repository<City>,
    private readonly dataSource: DataSource,
    private readonly chartOfAccountsService: ChartOfAccountsService,
    private readonly s3Service: S3Service,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(dto: CreateBrokerDto, activity?: ActivityActorContext) {
    await this.validateStateAndCity(dto.stateId, dto.cityId);

    const companyName = dto.companyName.trim();
    const ownerName = dto.ownerName.trim();
    const email = this.normalizeEmail(dto.email);

    const savedId = await this.dataSource.transaction(async (manager) => {
      const broker = await manager.save(
        manager.create(Broker, {
          companyName,
          ownerName,
          email,
          ntn: dto.ntn?.trim() || null,
          address: dto.address?.trim() || null,
          lat: dto.lat ?? null,
          lng: dto.lng ?? null,
          stateId: dto.stateId,
          cityId: dto.cityId,
          zipCode: dto.zipCode?.trim() || null,
          avatar: dto.avatar?.trim() || null,
          status: dto.status ?? BrokerStatus.ACTIVE,
        }),
      );

      await this.chartOfAccountsService.createLinkedLeaf(
        {
          parentCode: COA_PARENT_CODES.BROKER_RECEIVABLES,
          name: companyName,
          userId: null,
          accountKind: ChartOfAccountKind.PARTY_RECEIVABLE,
        },
        manager,
      );

      await this.chartOfAccountsService.createLinkedLeaf(
        {
          parentCode: COA_PARENT_CODES.BROKER_PAYABLES,
          name: companyName,
          userId: null,
          accountKind: ChartOfAccountKind.PARTY_PAYABLE,
        },
        manager,
      );

      return broker.id;
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Broker',
        entityId: savedId,
        record: companyName,
        description: `Created broker ${companyName}`,
        metadata: {
          status: dto.status ?? BrokerStatus.ACTIVE,
          coa: [
            COA_PARENT_CODES.BROKER_RECEIVABLES,
            COA_PARENT_CODES.BROKER_PAYABLES,
          ],
        },
      },
      activity,
    );

    return this.findOne(savedId);
  }

  async findAll(query: BrokerListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<Broker> = {};

    if (query.status) {
      where.status = query.status;
    }
    if (query.stateId !== undefined) {
      where.stateId = query.stateId;
    }
    if (query.cityId !== undefined) {
      where.cityId = query.cityId;
    }

    const search = query.search?.trim();
    const whereClause: FindOptionsWhere<Broker>[] | FindOptionsWhere<Broker> =
      search
        ? [
            { ...where, companyName: ILike(`%${search}%`) },
            { ...where, ownerName: ILike(`%${search}%`) },
            { ...where, email: ILike(`%${search}%`) },
            { ...where, ntn: ILike(`%${search}%`) },
          ]
        : where;

    const [data, total] = await this.brokerRepo.findAndCount({
      where: whereClause,
      relations: {
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

  async findOne(id: string) {
    return this.toBrokerResponse(await this.findByIdOrFail(id, true));
  }

  async update(
    id: string,
    dto: UpdateBrokerDto,
    activity?: ActivityActorContext,
  ) {
    const broker = await this.findByIdOrFail(id);
    const previousName = broker.companyName;

    if (dto.email !== undefined) {
      broker.email = this.normalizeEmail(dto.email);
    }

    const nextStateId =
      dto.stateId !== undefined ? dto.stateId : broker.stateId;
    const nextCityId =
      dto.cityId !== undefined ? dto.cityId : broker.cityId;
    await this.validateStateAndCity(nextStateId, nextCityId);

    if (dto.companyName !== undefined) {
      broker.companyName = dto.companyName.trim();
    }
    if (dto.ownerName !== undefined) {
      broker.ownerName = dto.ownerName.trim();
    }
    if (dto.ntn !== undefined) {
      broker.ntn = dto.ntn?.trim() || null;
    }
    if (dto.address !== undefined) {
      broker.address = dto.address?.trim() || null;
    }
    if (dto.lat !== undefined) broker.lat = dto.lat;
    if (dto.lng !== undefined) broker.lng = dto.lng;
    if (dto.stateId !== undefined) broker.stateId = dto.stateId;
    if (dto.cityId !== undefined) broker.cityId = dto.cityId;
    if (dto.zipCode !== undefined) {
      broker.zipCode = dto.zipCode?.trim() || null;
    }
    if (dto.avatar !== undefined) {
      broker.avatar = dto.avatar?.trim() || null;
    }

    await this.brokerRepo.save(broker);

    await this.chartOfAccountsService.syncLinkedLeafName(
      COA_PARENT_CODES.BROKER_RECEIVABLES,
      previousName,
      broker.companyName,
      ChartOfAccountKind.PARTY_RECEIVABLE,
    );
    await this.chartOfAccountsService.syncLinkedLeafName(
      COA_PARENT_CODES.BROKER_PAYABLES,
      previousName,
      broker.companyName,
      ChartOfAccountKind.PARTY_PAYABLE,
    );

    const updated = await this.findOne(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Broker',
        entityId: id,
        record: updated.companyName,
        description: `Updated broker ${updated.companyName}`,
        metadata: { previousName },
      },
      activity,
    );

    return updated;
  }

  async changeStatus(
    id: string,
    dto: ChangeBrokerStatusDto,
    activity?: ActivityActorContext,
  ) {
    const broker = await this.findByIdOrFail(id);
    const previousStatus = broker.status;
    broker.status = dto.status;
    await this.brokerRepo.save(broker);

    const updated = await this.findOne(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Broker',
        entityId: updated.id,
        record: updated.companyName,
        description: `Changed broker ${updated.companyName} status to ${updated.status}`,
        metadata: { previousStatus, status: updated.status },
      },
      activity,
    );

    return updated;
  }

  async remove(
    id: string,
    activity?: ActivityActorContext,
  ): Promise<{ message: string }> {
    const broker = await this.findByIdOrFail(id);
    const documents = await this.documentRepo.find({
      where: { brokerId: id },
    });
    const s3Keys = documents
      .map((d) => d.file)
      .filter((key): key is string => !!key?.trim());
    const companyName = broker.companyName;

    await this.dataSource.transaction(async (manager) => {
      await this.deleteBrokerPartyAccounts(companyName, manager);
      await manager.getRepository(Broker).delete(id);
    });

    for (const key of s3Keys) {
      try {
        await this.s3Service.deleteObject(key);
      } catch {
        // best-effort — DB already deleted
      }
    }

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Broker',
        entityId: broker.id,
        record: companyName,
        description: `Deleted broker ${companyName}`,
      },
      activity,
    );

    return { message: 'Broker deleted' };
  }

  /** Lightweight dropdown — no pagination. */
  async listUtility(
    opts: { search?: string; status?: BrokerStatus } = {},
  ) {
    const qb = this.brokerRepo
      .createQueryBuilder('t')
      .leftJoin('t.city', 'city')
      .select([
        't.id',
        't.companyName',
        't.ownerName',
        't.email',
        't.status',
        't.cityId',
        'city.id',
        'city.name',
      ])
      .orderBy('t.companyName', 'ASC');

    qb.andWhere('t.status = :status', {
      status: opts.status ?? BrokerStatus.ACTIVE,
    });

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          t.companyName ILIKE :search
          OR t.ownerName ILIKE :search
          OR t.email ILIKE :search
          OR t.ntn ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    const rows = await qb.getMany();
    return {
      data: rows.map((t) => ({
        id: t.id,
        label: t.companyName,
        companyName: t.companyName,
        ownerName: t.ownerName,
        email: t.email ?? null,
        status: t.status,
        cityId: t.cityId ?? null,
        cityName: t.city?.name ?? null,
      })),
    };
  }

  // ── Contacts ──────────────────────────────────────────────

  async listContacts(brokerId: string) {
    await this.ensureBrokerExists(brokerId);
    return this.contactRepo.find({
      where: { brokerId },
      order: { createdAt: 'DESC' },
    });
  }

  async findContact(brokerId: string, contactId: string) {
    return this.findContactOrFail(brokerId, contactId);
  }

  async createContact(
    brokerId: string,
    dto: CreateBrokerContactDto,
    activity?: ActivityActorContext,
  ) {
    await this.ensureBrokerExists(brokerId);
    const email = this.normalizeEmail(dto.email);
    if (email) {
      await this.ensureUniqueContactEmail(brokerId, email);
    }

    const contact = await this.contactRepo.save(
      this.contactRepo.create({
        brokerId,
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
        entityType: 'BrokerContact',
        entityId: contact.id,
        record: contact.name,
        description: `Created broker contact ${contact.name}`,
        metadata: { brokerId },
      },
      activity,
    );

    return contact;
  }

  async updateContact(
    brokerId: string,
    contactId: string,
    dto: UpdateBrokerContactDto,
    activity?: ActivityActorContext,
  ) {
    const contact = await this.findContactOrFail(brokerId, contactId);

    if (dto.email !== undefined) {
      const email = this.normalizeEmail(dto.email);
      if (email && email !== contact.email) {
        await this.ensureUniqueContactEmail(brokerId, email, contactId);
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
        entityType: 'BrokerContact',
        entityId: saved.id,
        record: saved.name,
        description: `Updated broker contact ${saved.name}`,
        metadata: { brokerId },
      },
      activity,
    );

    return saved;
  }

  async removeContact(
    brokerId: string,
    contactId: string,
    activity?: ActivityActorContext,
  ) {
    const contact = await this.findContactOrFail(brokerId, contactId);
    await this.contactRepo.delete({ id: contactId, brokerId });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'BrokerContact',
        entityId: contactId,
        record: contact.name,
        description: `Deleted broker contact ${contact.name}`,
        metadata: { brokerId },
      },
      activity,
    );

    return { message: 'Broker contact deleted' };
  }

  // ── Documents ─────────────────────────────────────────────

  async listDocuments(brokerId: string) {
    await this.ensureBrokerExists(brokerId);
    const docs = await this.documentRepo.find({
      where: { brokerId },
      order: { createdAt: 'DESC' },
    });
    return docs.map((d) => this.toDocumentResponse(d));
  }

  async uploadDocument(
    brokerId: string,
    dto: UploadBrokerDocumentDto,
    file?: Express.Multer.File,
    activity?: ActivityActorContext,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    await this.ensureBrokerExists(brokerId);

    const ext = this.fileExtension(file.originalname, file.mimetype);
    const key = `brokers/${brokerId}/documents/${randomUUID()}${ext}`;
    await this.s3Service.uploadObject(key, file.buffer, file.mimetype);

    const doc = await this.documentRepo.save(
      this.documentRepo.create({
        brokerId,
        name: dto.name?.trim() || file.originalname || null,
        validity: dto.validity ? new Date(dto.validity) : null,
        file: key,
      }),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'BrokerDocument',
        entityId: doc.id,
        record: doc.name ?? 'document',
        description: `Uploaded broker document ${doc.name ?? 'document'}`,
        metadata: { brokerId },
      },
      activity,
    );

    return this.toDocumentResponse(doc);
  }

  async removeDocument(
    brokerId: string,
    documentId: string,
    activity?: ActivityActorContext,
  ) {
    await this.ensureBrokerExists(brokerId);
    const doc = await this.documentRepo.findOne({
      where: { id: documentId, brokerId },
    });
    if (!doc) {
      throw new NotFoundException('Broker document not found');
    }

    const record = doc.name ?? 'document';

    if (doc.file) {
      try {
        await this.s3Service.deleteObject(doc.file);
      } catch {
        // continue — DB delete still proceeds
      }
    }

    await this.documentRepo.delete(doc.id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'BrokerDocument',
        entityId: documentId,
        record,
        description: `Deleted broker document ${record}`,
        metadata: { brokerId },
      },
      activity,
    );

    return { message: 'Broker document deleted' };
  }

  private async findByIdOrFail(
    id: string,
    withRelations = false,
  ): Promise<Broker> {
    const broker = await this.brokerRepo.findOne({
      where: { id },
      relations: {
        state: true,
        city: true,
        ...(withRelations
          ? { contacts: true, documents: true }
          : {}),
      },
    });
    if (!broker) {
      throw new NotFoundException('Broker not found');
    }
    return broker;
  }

  private toBrokerResponse(broker: Broker) {
    return {
      id: broker.id,
      companyName: broker.companyName,
      ownerName: broker.ownerName,
      email: broker.email ?? null,
      ntn: broker.ntn ?? null,
      address: broker.address ?? null,
      lat: broker.lat ?? null,
      lng: broker.lng ?? null,
      stateId: broker.stateId,
      cityId: broker.cityId,
      zipCode: broker.zipCode ?? null,
      avatar: broker.avatar ?? null,
      status: broker.status,
      createdAt: broker.createdAt,
      updatedAt: broker.updatedAt,
      state: broker.state ?? null,
      city: broker.city ?? null,
      contacts: broker.contacts ?? [],
      documents: (broker.documents ?? []).map((d) =>
        this.toDocumentResponse(d),
      ),
    };
  }

  private toDocumentResponse(doc: BrokerDocument) {
    return {
      id: doc.id,
      brokerId: doc.brokerId,
      name: doc.name ?? null,
      file: doc.file ?? null,
      fileUrl: doc.file ? this.s3Service.getObjectUrl(doc.file) : null,
      validity: doc.validity ?? null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private fileExtension(originalName: string, mimeType: string): string {
    const fromName = originalName.includes('.')
      ? originalName.slice(originalName.lastIndexOf('.'))
      : '';
    if (fromName && fromName.length <= 10) {
      return fromName.toLowerCase();
    }
    if (mimeType === 'application/pdf') return '.pdf';
    if (mimeType === 'image/png') return '.png';
    if (mimeType === 'image/jpeg') return '.jpg';
    return '';
  }

  private async deleteBrokerPartyAccounts(
    companyName: string,
    manager: EntityManager,
  ) {
    const name = companyName.trim();
    const targets: Array<{
      parentCode: string;
      accountKind: ChartOfAccountKind;
    }> = [
      {
        parentCode: COA_PARENT_CODES.BROKER_RECEIVABLES,
        accountKind: ChartOfAccountKind.PARTY_RECEIVABLE,
      },
      {
        parentCode: COA_PARENT_CODES.BROKER_PAYABLES,
        accountKind: ChartOfAccountKind.PARTY_PAYABLE,
      },
    ];

    for (const target of targets) {
      const partyAcc = await manager.getRepository(ChartOfAccount).findOne({
        where: {
          parentCode: target.parentCode,
          name,
          accountKind: target.accountKind,
        },
      });
      if (!partyAcc) continue;

      await manager
        .getRepository(Transaction)
        .delete({ chartOfAccountId: partyAcc.id });
      await manager.getRepository(ChartOfAccount).delete(partyAcc.id);
    }
  }

  private async ensureBrokerExists(brokerId: string): Promise<void> {
    const exists = await this.brokerRepo.exist({
      where: { id: brokerId },
    });
    if (!exists) {
      throw new NotFoundException('Broker not found');
    }
  }

  private normalizeEmail(email?: string | null): string | null {
    if (email === undefined || email === null || email.trim() === '') {
      return null;
    }
    return email.toLowerCase().trim();
  }

  private async ensureUniqueContactEmail(
    brokerId: string,
    email: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.contactRepo.findOne({
      where: { brokerId, email },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        'Contact email already exists for this broker',
      );
    }
  }

  private async findContactOrFail(brokerId: string, contactId: string) {
    const contact = await this.contactRepo.findOne({
      where: { id: contactId, brokerId },
    });
    if (!contact) {
      throw new NotFoundException('Broker contact not found');
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
