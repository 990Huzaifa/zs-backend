import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import {
  ChangeTransporterStatusDto,
  CreateTransporterContactDto,
  CreateTransporterDto,
  TransporterListQueryDto,
  UpdateTransporterContactDto,
  UpdateTransporterDto,
  UploadTransporterDocumentDto,
} from '../auth/dto/transporter.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import { S3Service } from '../common/s3/s3.service';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { City } from '../database/entities/city.entity';
import { State } from '../database/entities/state.entity';
import {
  Transporter,
  TransporterContact,
  TransporterDocument,
  TranspoterStatus,
} from '../database/entities/transporter.entity';
import { ActivitiesService } from './activities.service';

@Injectable()
export class TransportersService {
  constructor(
    @InjectRepository(Transporter)
    private readonly transporterRepo: Repository<Transporter>,
    @InjectRepository(TransporterContact)
    private readonly contactRepo: Repository<TransporterContact>,
    @InjectRepository(TransporterDocument)
    private readonly documentRepo: Repository<TransporterDocument>,
    @InjectRepository(State)
    private readonly stateRepo: Repository<State>,
    @InjectRepository(City)
    private readonly cityRepo: Repository<City>,
    private readonly s3Service: S3Service,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(dto: CreateTransporterDto, activity?: ActivityActorContext) {
    await this.validateStateAndCity(dto.stateId, dto.cityId);

    const companyName = dto.companyName.trim();
    const ownerName = dto.ownerName.trim();
    const email = this.normalizeEmail(dto.email);

    const saved = await this.transporterRepo.save(
      this.transporterRepo.create({
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
        status: dto.status ?? TranspoterStatus.ACTIVE,
      }),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Transporter',
        entityId: saved.id,
        record: companyName,
        description: `Created transporter ${companyName}`,
        metadata: { status: saved.status },
      },
      activity,
    );

    return this.findOne(saved.id);
  }

  async findAll(query: TransporterListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<Transporter> = {};

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
    const whereClause: FindOptionsWhere<Transporter>[] | FindOptionsWhere<Transporter> =
      search
        ? [
            { ...where, companyName: ILike(`%${search}%`) },
            { ...where, ownerName: ILike(`%${search}%`) },
            { ...where, email: ILike(`%${search}%`) },
            { ...where, ntn: ILike(`%${search}%`) },
          ]
        : where;

    const [data, total] = await this.transporterRepo.findAndCount({
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
    return this.toTransporterResponse(await this.findByIdOrFail(id, true));
  }

  async update(
    id: string,
    dto: UpdateTransporterDto,
    activity?: ActivityActorContext,
  ) {
    const transporter = await this.findByIdOrFail(id);
    const previousName = transporter.companyName;

    if (dto.email !== undefined) {
      transporter.email = this.normalizeEmail(dto.email);
    }

    const nextStateId =
      dto.stateId !== undefined ? dto.stateId : transporter.stateId;
    const nextCityId =
      dto.cityId !== undefined ? dto.cityId : transporter.cityId;
    await this.validateStateAndCity(nextStateId, nextCityId);

    if (dto.companyName !== undefined) {
      transporter.companyName = dto.companyName.trim();
    }
    if (dto.ownerName !== undefined) {
      transporter.ownerName = dto.ownerName.trim();
    }
    if (dto.ntn !== undefined) {
      transporter.ntn = dto.ntn?.trim() || null;
    }
    if (dto.address !== undefined) {
      transporter.address = dto.address?.trim() || null;
    }
    if (dto.lat !== undefined) transporter.lat = dto.lat;
    if (dto.lng !== undefined) transporter.lng = dto.lng;
    if (dto.stateId !== undefined) transporter.stateId = dto.stateId;
    if (dto.cityId !== undefined) transporter.cityId = dto.cityId;
    if (dto.zipCode !== undefined) {
      transporter.zipCode = dto.zipCode?.trim() || null;
    }
    if (dto.avatar !== undefined) {
      transporter.avatar = dto.avatar?.trim() || null;
    }

    await this.transporterRepo.save(transporter);

    const updated = await this.findOne(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Transporter',
        entityId: id,
        record: updated.companyName,
        description: `Updated transporter ${updated.companyName}`,
        metadata: { previousName },
      },
      activity,
    );

    return updated;
  }

  async changeStatus(
    id: string,
    dto: ChangeTransporterStatusDto,
    activity?: ActivityActorContext,
  ) {
    const transporter = await this.findByIdOrFail(id);
    const previousStatus = transporter.status;
    transporter.status = dto.status;
    await this.transporterRepo.save(transporter);

    const updated = await this.findOne(id);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'Transporter',
        entityId: updated.id,
        record: updated.companyName,
        description: `Changed transporter ${updated.companyName} status to ${updated.status}`,
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
    const transporter = await this.findByIdOrFail(id);
    const documents = await this.documentRepo.find({
      where: { transporterId: id },
    });
    const s3Keys = documents
      .map((d) => d.file)
      .filter((key): key is string => !!key?.trim());

    await this.transporterRepo.delete(id);

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
        entityType: 'Transporter',
        entityId: transporter.id,
        record: transporter.companyName,
        description: `Deleted transporter ${transporter.companyName}`,
      },
      activity,
    );

    return { message: 'Transporter deleted' };
  }

  /** Lightweight dropdown — no pagination. */
  async listUtility(
    opts: { search?: string; status?: TranspoterStatus } = {},
  ) {
    const qb = this.transporterRepo
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
      status: opts.status ?? TranspoterStatus.ACTIVE,
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

  async listContacts(transporterId: string) {
    await this.ensureTransporterExists(transporterId);
    return this.contactRepo.find({
      where: { transporterId },
      order: { createdAt: 'DESC' },
    });
  }

  async findContact(transporterId: string, contactId: string) {
    return this.findContactOrFail(transporterId, contactId);
  }

  async createContact(
    transporterId: string,
    dto: CreateTransporterContactDto,
    activity?: ActivityActorContext,
  ) {
    await this.ensureTransporterExists(transporterId);
    const email = this.normalizeEmail(dto.email);
    if (email) {
      await this.ensureUniqueContactEmail(transporterId, email);
    }

    const contact = await this.contactRepo.save(
      this.contactRepo.create({
        transporterId,
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
        entityType: 'TransporterContact',
        entityId: contact.id,
        record: contact.name,
        description: `Created transporter contact ${contact.name}`,
        metadata: { transporterId },
      },
      activity,
    );

    return contact;
  }

  async updateContact(
    transporterId: string,
    contactId: string,
    dto: UpdateTransporterContactDto,
    activity?: ActivityActorContext,
  ) {
    const contact = await this.findContactOrFail(transporterId, contactId);

    if (dto.email !== undefined) {
      const email = this.normalizeEmail(dto.email);
      if (email && email !== contact.email) {
        await this.ensureUniqueContactEmail(transporterId, email, contactId);
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
        entityType: 'TransporterContact',
        entityId: saved.id,
        record: saved.name,
        description: `Updated transporter contact ${saved.name}`,
        metadata: { transporterId },
      },
      activity,
    );

    return saved;
  }

  async removeContact(
    transporterId: string,
    contactId: string,
    activity?: ActivityActorContext,
  ) {
    const contact = await this.findContactOrFail(transporterId, contactId);
    await this.contactRepo.delete({ id: contactId, transporterId });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'TransporterContact',
        entityId: contactId,
        record: contact.name,
        description: `Deleted transporter contact ${contact.name}`,
        metadata: { transporterId },
      },
      activity,
    );

    return { message: 'Transporter contact deleted' };
  }

  // ── Documents ─────────────────────────────────────────────

  async listDocuments(transporterId: string) {
    await this.ensureTransporterExists(transporterId);
    const docs = await this.documentRepo.find({
      where: { transporterId },
      order: { createdAt: 'DESC' },
    });
    return docs.map((d) => this.toDocumentResponse(d));
  }

  async uploadDocument(
    transporterId: string,
    dto: UploadTransporterDocumentDto,
    file?: Express.Multer.File,
    activity?: ActivityActorContext,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    await this.ensureTransporterExists(transporterId);

    const ext = this.fileExtension(file.originalname, file.mimetype);
    const key = `transporters/${transporterId}/documents/${randomUUID()}${ext}`;
    await this.s3Service.uploadObject(key, file.buffer, file.mimetype);

    const doc = await this.documentRepo.save(
      this.documentRepo.create({
        transporterId,
        name: dto.name?.trim() || file.originalname || null,
        validity: dto.validity ? new Date(dto.validity) : null,
        file: key,
      }),
    );

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.MARKETPLACE,
        entityType: 'TransporterDocument',
        entityId: doc.id,
        record: doc.name ?? 'document',
        description: `Uploaded transporter document ${doc.name ?? 'document'}`,
        metadata: { transporterId },
      },
      activity,
    );

    return this.toDocumentResponse(doc);
  }

  async removeDocument(
    transporterId: string,
    documentId: string,
    activity?: ActivityActorContext,
  ) {
    await this.ensureTransporterExists(transporterId);
    const doc = await this.documentRepo.findOne({
      where: { id: documentId, transporterId },
    });
    if (!doc) {
      throw new NotFoundException('Transporter document not found');
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
        entityType: 'TransporterDocument',
        entityId: documentId,
        record,
        description: `Deleted transporter document ${record}`,
        metadata: { transporterId },
      },
      activity,
    );

    return { message: 'Transporter document deleted' };
  }

  private async findByIdOrFail(
    id: string,
    withRelations = false,
  ): Promise<Transporter> {
    const transporter = await this.transporterRepo.findOne({
      where: { id },
      relations: {
        state: true,
        city: true,
        ...(withRelations
          ? { contacts: true, documents: true }
          : {}),
      },
    });
    if (!transporter) {
      throw new NotFoundException('Transporter not found');
    }
    return transporter;
  }

  private toTransporterResponse(transporter: Transporter) {
    return {
      id: transporter.id,
      companyName: transporter.companyName,
      ownerName: transporter.ownerName,
      email: transporter.email ?? null,
      ntn: transporter.ntn ?? null,
      address: transporter.address ?? null,
      lat: transporter.lat ?? null,
      lng: transporter.lng ?? null,
      stateId: transporter.stateId,
      cityId: transporter.cityId,
      zipCode: transporter.zipCode ?? null,
      avatar: transporter.avatar ?? null,
      status: transporter.status,
      createdAt: transporter.createdAt,
      updatedAt: transporter.updatedAt,
      state: transporter.state ?? null,
      city: transporter.city ?? null,
      contacts: transporter.contacts ?? [],
      documents: (transporter.documents ?? []).map((d) =>
        this.toDocumentResponse(d),
      ),
    };
  }

  private toDocumentResponse(doc: TransporterDocument) {
    return {
      id: doc.id,
      transporterId: doc.transporterId,
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

  private async ensureTransporterExists(transporterId: string): Promise<void> {
    const exists = await this.transporterRepo.exist({
      where: { id: transporterId },
    });
    if (!exists) {
      throw new NotFoundException('Transporter not found');
    }
  }

  private normalizeEmail(email?: string | null): string | null {
    if (email === undefined || email === null || email.trim() === '') {
      return null;
    }
    return email.toLowerCase().trim();
  }

  private async ensureUniqueContactEmail(
    transporterId: string,
    email: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.contactRepo.findOne({
      where: { transporterId, email },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        'Contact email already exists for this transporter',
      );
    }
  }

  private async findContactOrFail(transporterId: string, contactId: string) {
    const contact = await this.contactRepo.findOne({
      where: { id: contactId, transporterId },
    });
    if (!contact) {
      throw new NotFoundException('Transporter contact not found');
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
