import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, In, Repository } from 'typeorm';
import {
  ChangeClientStatusDto,
  ClientListQueryDto,
  CreateClientContactDto,
  CreateClientDto,
  CreateClientLocationDto,
  UpdateClientContactDto,
  UpdateClientDto,
  UpdateClientLocationDto,
  UploadClientDocumentDto,
} from '../auth/dto/client.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import { S3Service } from '../common/s3/s3.service';
import { COA_PARENT_CODES } from '../database/chart-of-accounts/constants/coa-parent-codes';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { ChartOfAccountKind } from '../database/entities/chart-of-account.entity';
import { City } from '../database/entities/city.entity';
import {
  Client,
  ClientContact,
  ClientDocument,
  ClientDropoffLocation,
  ClientPickupLocation,
  ClientStatus,
} from '../database/entities/client.entity';
import { TaxRule } from '../database/entities/tax-rule.entity';
import { ActivitiesService } from './activities.service';
import { ChartOfAccountsService } from './chart-of-accounts.service';
import { WarehousesService } from './warehouses.service';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(ClientContact)
    private readonly contactRepo: Repository<ClientContact>,
    @InjectRepository(ClientPickupLocation)
    private readonly pickupRepo: Repository<ClientPickupLocation>,
    @InjectRepository(ClientDropoffLocation)
    private readonly dropoffRepo: Repository<ClientDropoffLocation>,
    @InjectRepository(ClientDocument)
    private readonly documentRepo: Repository<ClientDocument>,
    @InjectRepository(TaxRule)
    private readonly taxRuleRepo: Repository<TaxRule>,
    @InjectRepository(City)
    private readonly cityRepo: Repository<City>,
    private readonly dataSource: DataSource,
    private readonly s3Service: S3Service,
    private readonly chartOfAccountsService: ChartOfAccountsService,
    private readonly activitiesService: ActivitiesService,
    private readonly warehousesService: WarehousesService,
  ) {}

  async create(dto: CreateClientDto, activity?: ActivityActorContext) {
    const email = dto.email.toLowerCase().trim();
    await this.ensureUniqueEmail(email);
    await this.ensureUniqueNtn(dto.ntn.trim());
    await this.ensureUniqueSaleTaxNo(dto.saleTaxNo.trim());
    await this.ensureCity(dto.cityId);

    const saleTaxTypes = await this.resolveTaxRules(dto.saleTaxTypeIds);
    const companyName = dto.companyName.trim();

    const savedId = await this.dataSource.transaction(async (manager) => {
      const client = await manager.save(
        manager.create(Client, {
          joiningDate: dto.joiningDate ? new Date(dto.joiningDate) : null,
          companyName,
          companyAddress: dto.companyAddress.trim(),
          postalCode: dto.postalCode.trim(),
          cityId: dto.cityId,
          email,
          ntn: dto.ntn.trim(),
          saleTaxNo: dto.saleTaxNo.trim(),
          ptclNo: dto.ptclNo?.trim() || null,
          status: dto.status ?? ClientStatus.ACTIVE,
          saleTaxTypes,
          saleTaxStatus: dto.saleTaxStatus ?? false,
          withHoldingTaxStatus: dto.withHoldingTaxStatus ?? false,
          isWarehouseOwner: dto.isWarehouseOwner ?? false,
        }),
      );

      await this.chartOfAccountsService.createLinkedLeaf(
        {
          parentCode: COA_PARENT_CODES.CUSTOMER_RECEIVABLES,
          name: companyName,
          userId: null,
          accountKind: ChartOfAccountKind.PARTY_RECEIVABLE,
        },
        manager,
      );

      if (client.isWarehouseOwner) {
        await this.warehousesService.ensureForClient(
          client.id,
          activity,
          manager,
        );
      }

      return client.id;
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Client',
        entityId: savedId,
        record: companyName,
        description: `Created client ${companyName}`,
      },
      activity,
    );

    return this.findOne(savedId);
  }

  /**
   * Lightweight client list for dropdowns — no pagination.
   * Returns only id, companyName, email, status.
   */
  async listUtility(opts: { search?: string; status?: ClientStatus } = {}) {
    const qb = this.clientRepo
      .createQueryBuilder('client')
      .select([
        'client.id',
        'client.companyName',
        'client.email',
        'client.status',
      ])
      .orderBy('client.companyName', 'ASC');

    qb.andWhere('client.status = :status', {
      status: opts.status ?? ClientStatus.ACTIVE,
    });

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere(
        '(client.companyName ILIKE :search OR client.email ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const rows = await qb.getMany();
    return {
      data: rows.map((c) => ({
        id: c.id,
        label: c.companyName,
        companyName: c.companyName,
        email: c.email,
        status: c.status,
      })),
    };
  }

  /**
   * Pickup locations for a client — no pagination, ACTIVE only by default.
   */
  async listPickupLocationsUtility(
    clientId: string,
    opts: { search?: string; status?: ClientStatus } = {},
  ) {
    const qb = this.pickupRepo
      .createQueryBuilder('loc')
      .select([
        'loc.id',
        'loc.name',
        'loc.address',
        'loc.lat',
        'loc.lng',
        'loc.contactPersonName',
        'loc.contactPersonPhone',
        'loc.status',
      ])
      .where('loc.clientId = :clientId', { clientId })
      .andWhere('loc.status = :status', {
        status: opts.status ?? ClientStatus.ACTIVE,
      })
      .orderBy('loc.name', 'ASC');

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere(
        '(loc.name ILIKE :search OR loc.address ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const rows = await qb.getMany();
    return {
      data: rows.map((loc) => ({
        id: loc.id,
        label: loc.name,
        name: loc.name,
        address: loc.address,
        lat: loc.lat,
        lng: loc.lng,
        contactPersonName: loc.contactPersonName ?? null,
        contactPersonPhone: loc.contactPersonPhone ?? null,
        status: loc.status,
      })),
    };
  }

  /**
   * Dropoff locations for a client — no pagination, ACTIVE only by default.
   */
  async listDropoffLocationsUtility(
    clientId: string,
    opts: { search?: string; status?: ClientStatus } = {},
  ) {
    const qb = this.dropoffRepo
      .createQueryBuilder('loc')
      .select([
        'loc.id',
        'loc.name',
        'loc.address',
        'loc.lat',
        'loc.lng',
        'loc.contactPersonName',
        'loc.contactPersonPhone',
        'loc.status',
      ])
      .where('loc.clientId = :clientId', { clientId })
      .andWhere('loc.status = :status', {
        status: opts.status ?? ClientStatus.ACTIVE,
      })
      .orderBy('loc.name', 'ASC');

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere(
        '(loc.name ILIKE :search OR loc.address ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const rows = await qb.getMany();
    return {
      data: rows.map((loc) => ({
        id: loc.id,
        label: loc.name,
        name: loc.name,
        address: loc.address,
        lat: loc.lat,
        lng: loc.lng,
        contactPersonName: loc.contactPersonName ?? null,
        contactPersonPhone: loc.contactPersonPhone ?? null,
        status: loc.status,
      })),
    };
  }

  async findAll(query: ClientListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const qb = this.clientRepo
      .createQueryBuilder('client')
      .leftJoinAndSelect('client.saleTaxTypes', 'saleTaxTypes')
      .leftJoinAndSelect('client.city', 'city')
      .leftJoinAndSelect('city.state', 'state')
      .orderBy('client.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.status) {
      qb.andWhere('client.status = :status', { status: query.status });
    }
    if (query.cityId !== undefined) {
      qb.andWhere('client.cityId = :cityId', { cityId: query.cityId });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          client.companyName ILIKE :search
          OR client.email ILIKE :search
          OR client.ptclNo ILIKE :search
          OR client.ntn ILIKE :search
          OR client.saleTaxNo ILIKE :search
          OR city.name ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    const [rows, total] = await qb.getManyAndCount();

    return {
      data: rows.map((c) => this.toClientResponse(c)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string) {
    const client = await this.findByIdOrFail(id);
    return {
      ...this.toClientResponse(client),
      contacts: client.contacts ?? [],
      pickupLocations: client.pickupLocations ?? [],
      dropoffLocations: client.dropoffLocations ?? [],
      documents: (client.documents ?? []).map((d) =>
        this.toDocumentResponse(d),
      ),
      warehouses: client.warehouses ?? [],
    };
  }

  async update(
    id: string,
    dto: UpdateClientDto,
    activity?: ActivityActorContext,
  ) {
    const client = await this.findByIdOrFail(id);
    const previousCompanyName = client.companyName;

    if (dto.email !== undefined) {
      const email = dto.email.toLowerCase().trim();
      if (email !== client.email) {
        await this.ensureUniqueEmail(email, id);
      }
      client.email = email;
    }
    if (dto.ntn !== undefined) {
      const ntn = dto.ntn.trim();
      if (ntn !== client.ntn) {
        await this.ensureUniqueNtn(ntn, id);
      }
      client.ntn = ntn;
    }
    if (dto.saleTaxNo !== undefined) {
      const saleTaxNo = dto.saleTaxNo.trim();
      if (saleTaxNo !== client.saleTaxNo) {
        await this.ensureUniqueSaleTaxNo(saleTaxNo, id);
      }
      client.saleTaxNo = saleTaxNo;
    }

    if (dto.companyName !== undefined) {
      client.companyName = dto.companyName.trim();
    }
    if (dto.companyAddress !== undefined) {
      client.companyAddress = dto.companyAddress.trim();
    }
    if (dto.postalCode !== undefined) {
      client.postalCode = dto.postalCode.trim();
    }
    if (dto.cityId !== undefined) {
      await this.ensureCity(dto.cityId);
      client.cityId = dto.cityId;
    }
    if (dto.joiningDate !== undefined) {
      client.joiningDate = dto.joiningDate
        ? new Date(dto.joiningDate)
        : null;
    }
    if (dto.ptclNo !== undefined) {
      client.ptclNo = dto.ptclNo?.trim() || null;
    }
    if (dto.saleTaxTypeIds !== undefined) {
      client.saleTaxTypes = await this.resolveTaxRules(dto.saleTaxTypeIds);
    }
    if (dto.saleTaxStatus !== undefined) {
      client.saleTaxStatus = dto.saleTaxStatus;
    }
    if (dto.withHoldingTaxStatus !== undefined) {
      client.withHoldingTaxStatus = dto.withHoldingTaxStatus;
    }
    if (dto.isWarehouseOwner !== undefined) {
      client.isWarehouseOwner = dto.isWarehouseOwner;
    }

    await this.clientRepo.save(client);

    if (client.isWarehouseOwner) {
      await this.warehousesService.ensureForClient(client.id, activity);
    }

    await this.chartOfAccountsService.syncLinkedLeafName(
      COA_PARENT_CODES.CUSTOMER_RECEIVABLES,
      previousCompanyName,
      client.companyName,
      ChartOfAccountKind.PARTY_RECEIVABLE,
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Client',
        entityId: id,
        record: client.companyName,
        description: `Updated client ${client.companyName}`,
      },
      activity,
    );

    return this.findOne(id);
  }

  async changeStatus(
    id: string,
    dto: ChangeClientStatusDto,
    activity?: ActivityActorContext,
  ) {
    const client = await this.findByIdOrFail(id);
    client.status = dto.status;
    await this.clientRepo.save(client);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Client',
        entityId: id,
        record: client.companyName,
        description: `Changed client status to ${dto.status}`,
        metadata: { status: dto.status },
      },
      activity,
    );

    return this.findOne(id);
  }

  // ── Contacts ──────────────────────────────────────────────

  async listContacts(clientId: string) {
    await this.ensureClientExists(clientId);
    return this.contactRepo.find({
      where: { clientId },
      order: { createdAt: 'DESC' },
    });
  }

  async findContact(clientId: string, contactId: string) {
    return this.findContactOrFail(clientId, contactId);
  }

  async createContact(
    clientId: string,
    dto: CreateClientContactDto,
    activity?: ActivityActorContext,
  ) {
    await this.ensureClientExists(clientId);
    const email = this.normalizeOptionalEmail(dto.email);
    if (email) {
      await this.ensureUniqueContactEmail(clientId, email);
    }

    const contact = await this.contactRepo.save(
      this.contactRepo.create({
        clientId,
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
        entityType: 'ClientContact',
        entityId: contact.id,
        record: contact.name,
        description: `Created client contact ${contact.name}`,
        metadata: { clientId },
      },
      activity,
    );

    return contact;
  }

  async updateContact(
    clientId: string,
    contactId: string,
    dto: UpdateClientContactDto,
    activity?: ActivityActorContext,
  ) {
    const contact = await this.findContactOrFail(clientId, contactId);

    if (dto.email !== undefined) {
      const email = this.normalizeOptionalEmail(dto.email);
      if (email && email !== contact.email) {
        await this.ensureUniqueContactEmail(clientId, email, contactId);
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
        entityType: 'ClientContact',
        entityId: saved.id,
        record: saved.name,
        description: `Updated client contact ${saved.name}`,
        metadata: { clientId },
      },
      activity,
    );

    return saved;
  }

  async removeContact(
    clientId: string,
    contactId: string,
    activity?: ActivityActorContext,
  ) {
    const contact = await this.findContactOrFail(clientId, contactId);
    await this.contactRepo.delete({ id: contactId, clientId });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'ClientContact',
        entityId: contactId,
        record: contact.name,
        description: `Deleted client contact ${contact.name}`,
        metadata: { clientId },
      },
      activity,
    );

    return { message: 'Client contact deleted' };
  }

  // ── Pickup locations ──────────────────────────────────────

  async listPickupLocations(
    clientId: string,
    status?: ClientStatus,
  ) {
    await this.ensureClientExists(clientId);
    return this.pickupRepo.find({
      where: status ? { clientId, status } : { clientId },
      order: { createdAt: 'DESC' },
    });
  }

  async findPickupLocation(clientId: string, locationId: string) {
    return this.findPickupOrFail(clientId, locationId);
  }

  async createPickupLocation(
    clientId: string,
    dto: CreateClientLocationDto,
    activity?: ActivityActorContext,
  ) {
    await this.ensureClientExists(clientId);
    const name = dto.name.trim();
    await this.ensureUniqueLocationName(this.pickupRepo, clientId, name);

    const loc = await this.pickupRepo.save(
      this.pickupRepo.create(this.mapLocationCreate(clientId, dto, name)),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'ClientPickupLocation',
        entityId: loc.id,
        record: loc.name,
        description: `Created pickup location ${loc.name}`,
        metadata: { clientId },
      },
      activity,
    );

    return loc;
  }

  async updatePickupLocation(
    clientId: string,
    locationId: string,
    dto: UpdateClientLocationDto,
    activity?: ActivityActorContext,
  ) {
    const loc = await this.findPickupOrFail(clientId, locationId);
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name !== loc.name) {
        await this.ensureUniqueLocationName(
          this.pickupRepo,
          clientId,
          name,
          locationId,
        );
      }
    }
    this.applyLocationUpdate(loc, dto);
    const saved = await this.pickupRepo.save(loc);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'ClientPickupLocation',
        entityId: saved.id,
        record: saved.name,
        description: `Updated pickup location ${saved.name}`,
        metadata: { clientId },
      },
      activity,
    );

    return saved;
  }

  async changePickupStatus(
    clientId: string,
    locationId: string,
    dto: ChangeClientStatusDto,
    activity?: ActivityActorContext,
  ) {
    const loc = await this.findPickupOrFail(clientId, locationId);
    loc.status = dto.status;
    const saved = await this.pickupRepo.save(loc);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'ClientPickupLocation',
        entityId: saved.id,
        record: saved.name,
        description: `Changed pickup location status to ${dto.status}`,
        metadata: { clientId, status: dto.status },
      },
      activity,
    );

    return saved;
  }

  async removePickupLocation(
    clientId: string,
    locationId: string,
    activity?: ActivityActorContext,
  ) {
    const loc = await this.findPickupOrFail(clientId, locationId);
    await this.pickupRepo.delete({ id: locationId, clientId });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'ClientPickupLocation',
        entityId: locationId,
        record: loc.name,
        description: `Deleted pickup location ${loc.name}`,
        metadata: { clientId },
      },
      activity,
    );

    return { message: 'Pickup location deleted' };
  }

  // ── Dropoff locations ─────────────────────────────────────

  async listDropoffLocations(
    clientId: string,
    status?: ClientStatus,
  ) {
    await this.ensureClientExists(clientId);
    return this.dropoffRepo.find({
      where: status ? { clientId, status } : { clientId },
      order: { createdAt: 'DESC' },
    });
  }

  async findDropoffLocation(clientId: string, locationId: string) {
    return this.findDropoffOrFail(clientId, locationId);
  }

  async createDropoffLocation(
    clientId: string,
    dto: CreateClientLocationDto,
    activity?: ActivityActorContext,
  ) {
    await this.ensureClientExists(clientId);
    const name = dto.name.trim();
    await this.ensureUniqueLocationName(this.dropoffRepo, clientId, name);

    const loc = await this.dropoffRepo.save(
      this.dropoffRepo.create(this.mapLocationCreate(clientId, dto, name)),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'ClientDropoffLocation',
        entityId: loc.id,
        record: loc.name,
        description: `Created dropoff location ${loc.name}`,
        metadata: { clientId },
      },
      activity,
    );

    return loc;
  }

  async updateDropoffLocation(
    clientId: string,
    locationId: string,
    dto: UpdateClientLocationDto,
    activity?: ActivityActorContext,
  ) {
    const loc = await this.findDropoffOrFail(clientId, locationId);
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name !== loc.name) {
        await this.ensureUniqueLocationName(
          this.dropoffRepo,
          clientId,
          name,
          locationId,
        );
      }
    }
    this.applyLocationUpdate(loc, dto);
    const saved = await this.dropoffRepo.save(loc);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'ClientDropoffLocation',
        entityId: saved.id,
        record: saved.name,
        description: `Updated dropoff location ${saved.name}`,
        metadata: { clientId },
      },
      activity,
    );

    return saved;
  }

  async changeDropoffStatus(
    clientId: string,
    locationId: string,
    dto: ChangeClientStatusDto,
    activity?: ActivityActorContext,
  ) {
    const loc = await this.findDropoffOrFail(clientId, locationId);
    loc.status = dto.status;
    const saved = await this.dropoffRepo.save(loc);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'ClientDropoffLocation',
        entityId: saved.id,
        record: saved.name,
        description: `Changed dropoff location status to ${dto.status}`,
        metadata: { clientId, status: dto.status },
      },
      activity,
    );

    return saved;
  }

  async removeDropoffLocation(
    clientId: string,
    locationId: string,
    activity?: ActivityActorContext,
  ) {
    const loc = await this.findDropoffOrFail(clientId, locationId);
    await this.dropoffRepo.delete({ id: locationId, clientId });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'ClientDropoffLocation',
        entityId: locationId,
        record: loc.name,
        description: `Deleted dropoff location ${loc.name}`,
        metadata: { clientId },
      },
      activity,
    );

    return { message: 'Dropoff location deleted' };
  }

  // ── Documents ─────────────────────────────────────────────

  async listDocuments(clientId: string) {
    await this.ensureClientExists(clientId);
    const docs = await this.documentRepo.find({
      where: { clientId },
      order: { createdAt: 'DESC' },
    });
    return docs.map((d) => this.toDocumentResponse(d));
  }

  async uploadDocument(
    clientId: string,
    dto: UploadClientDocumentDto,
    file?: Express.Multer.File,
    activity?: ActivityActorContext,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    await this.ensureClientExists(clientId);

    const ext = this.fileExtension(file.originalname, file.mimetype);
    const key = `clients/${clientId}/documents/${randomUUID()}${ext}`;
    await this.s3Service.uploadObject(key, file.buffer, file.mimetype);

    const doc = await this.documentRepo.save(
      this.documentRepo.create({
        clientId,
        docType: dto.docType,
        validity: dto.validity,
        name: dto.name?.trim() || file.originalname || null,
        file: key,
      }),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'ClientDocument',
        entityId: doc.id,
        record: doc.name ?? doc.docType,
        description: `Uploaded client document ${doc.name ?? doc.docType}`,
        metadata: { clientId, docType: doc.docType },
      },
      activity,
    );

    return this.toDocumentResponse(doc);
  }

  async removeDocument(
    clientId: string,
    documentId: string,
    activity?: ActivityActorContext,
  ) {
    await this.ensureClientExists(clientId);
    const doc = await this.documentRepo.findOne({
      where: { id: documentId, clientId },
    });
    if (!doc) {
      throw new NotFoundException('Client document not found');
    }
    if (doc.file) {
      try {
        await this.s3Service.deleteObject(doc.file);
      } catch {
        // continue
      }
    }
    await this.documentRepo.delete(doc.id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'ClientDocument',
        entityId: documentId,
        record: doc.name ?? doc.docType,
        description: `Deleted client document ${doc.name ?? doc.docType}`,
        metadata: { clientId },
      },
      activity,
    );

    return { message: 'Client document deleted' };
  }

  // ── Helpers ───────────────────────────────────────────────

  private async findByIdOrFail(id: string): Promise<Client> {
    const client = await this.clientRepo.findOne({
      where: { id },
      relations: {
        saleTaxTypes: true,
        city: { state: true },
        contacts: true,
        pickupLocations: true,
        dropoffLocations: true,
        documents: true,
        warehouses: true,
      },
    });
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    return client;
  }

  private async ensureCity(cityId: number): Promise<void> {
    const city = await this.cityRepo.findOne({
      where: { id: cityId as unknown as string, isActive: true },
    });
    if (!city) {
      throw new NotFoundException('City not found or inactive');
    }
  }

  private async ensureClientExists(id: string) {
    const exists = await this.clientRepo.exist({ where: { id } });
    if (!exists) {
      throw new NotFoundException('Client not found');
    }
  }

  private async resolveTaxRules(ids?: string[]): Promise<TaxRule[]> {
    if (!ids?.length) return [];
    const rules = await this.taxRuleRepo.find({ where: { id: In(ids) } });
    if (rules.length !== ids.length) {
      throw new BadRequestException('One or more tax rule ids are invalid');
    }
    return rules;
  }

  private async ensureUniqueEmail(email: string, excludeId?: string) {
    const existing = await this.clientRepo.findOne({ where: { email } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Client email already exists');
    }
  }

  private async ensureUniqueNtn(ntn: string, excludeId?: string) {
    const existing = await this.clientRepo.findOne({ where: { ntn } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('NTN already exists');
    }
  }

  private async ensureUniqueSaleTaxNo(saleTaxNo: string, excludeId?: string) {
    const existing = await this.clientRepo.findOne({ where: { saleTaxNo } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Sales tax number already exists');
    }
  }

  private async ensureUniqueContactEmail(
    clientId: string,
    email: string,
    excludeId?: string,
  ) {
    const existing = await this.contactRepo.findOne({
      where: { clientId, email },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        'Contact email already exists for this client',
      );
    }
  }

  private async ensureUniqueLocationName(
    repo: Repository<ClientPickupLocation> | Repository<ClientDropoffLocation>,
    clientId: string,
    name: string,
    excludeId?: string,
  ) {
    const existing = await repo.findOne({
      where: { clientId, name },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        'Location name already exists for this client',
      );
    }
  }

  private normalizeOptionalEmail(email?: string | null): string | null {
    if (email === undefined || email === null || email.trim() === '') {
      return null;
    }
    return email.toLowerCase().trim();
  }

  private async findContactOrFail(clientId: string, contactId: string) {
    const contact = await this.contactRepo.findOne({
      where: { id: contactId, clientId },
    });
    if (!contact) {
      throw new NotFoundException('Client contact not found');
    }
    return contact;
  }

  private async findPickupOrFail(clientId: string, locationId: string) {
    const loc = await this.pickupRepo.findOne({
      where: { id: locationId, clientId },
    });
    if (!loc) {
      throw new NotFoundException('Pickup location not found');
    }
    return loc;
  }

  private async findDropoffOrFail(clientId: string, locationId: string) {
    const loc = await this.dropoffRepo.findOne({
      where: { id: locationId, clientId },
    });
    if (!loc) {
      throw new NotFoundException('Dropoff location not found');
    }
    return loc;
  }

  private mapLocationCreate(
    clientId: string,
    dto: CreateClientLocationDto,
    name: string,
  ) {
    return {
      clientId,
      name,
      address: dto.address.trim(),
      lat: dto.lat?.trim() || null,
      lng: dto.lng?.trim() || null,
      contactPersonName: dto.contactPersonName?.trim() || null,
      contactPersonPhone: dto.contactPersonPhone?.trim() || null,
      status: dto.status ?? ClientStatus.ACTIVE,
    };
  }

  private applyLocationUpdate(
    loc: ClientPickupLocation | ClientDropoffLocation,
    dto: UpdateClientLocationDto,
  ) {
    if (dto.name !== undefined) loc.name = dto.name.trim();
    if (dto.address !== undefined) loc.address = dto.address.trim();
    if (dto.lat !== undefined) loc.lat = dto.lat?.trim() || null;
    if (dto.lng !== undefined) loc.lng = dto.lng?.trim() || null;
    if (dto.contactPersonName !== undefined) {
      loc.contactPersonName = dto.contactPersonName?.trim() || null;
    }
    if (dto.contactPersonPhone !== undefined) {
      loc.contactPersonPhone = dto.contactPersonPhone?.trim() || null;
    }
  }

  private toClientResponse(client: Client) {
    return {
      id: client.id,
      joiningDate: client.joiningDate ?? null,
      companyName: client.companyName,
      companyAddress: client.companyAddress,
      postalCode: client.postalCode,
      cityId: client.cityId,
      city: client.city
        ? {
            id: client.city.id,
            name: client.city.name,
            code: client.city.code,
            stateId: client.city.stateId,
            state: client.city.state
              ? {
                  id: client.city.state.id,
                  name: client.city.state.name,
                  code: client.city.state.code,
                }
              : undefined,
          }
        : null,
      email: client.email,
      ntn: client.ntn,
      saleTaxNo: client.saleTaxNo,
      ptclNo: client.ptclNo ?? null,
      status: client.status,
      saleTaxTypeIds: client.saleTaxTypeIds ?? [],
      saleTaxTypes: client.saleTaxTypes ?? [],
      saleTaxStatus: client.saleTaxStatus,
      withHoldingTaxStatus: client.withHoldingTaxStatus,
      isWarehouseOwner: client.isWarehouseOwner,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    };
  }

  private toDocumentResponse(doc: ClientDocument) {
    return {
      id: doc.id,
      clientId: doc.clientId,
      name: doc.name,
      docType: doc.docType,
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
}
