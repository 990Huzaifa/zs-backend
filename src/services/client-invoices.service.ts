import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as QRCode from 'qrcode';
import { DataSource, In, Repository } from 'typeorm';
import {
  ChangeClientInvoiceStatusDto,
  CreateClientInvoiceDto,
  CreateClientInvoiceItemDto,
  ClientInvoiceListQueryDto,
  UpdateClientInvoiceDto,
} from '../auth/dto/client-invoice.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  CLIENT_INVOICE_PREFIX,
  nextSerialCode,
} from '../common/utils/serial-code.util';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { Client, ClientStatus } from '../database/entities/client.entity';
import {
  ClientInvoice,
  ClientInvoiceItem,
  ClientInvoiceStatus,
} from '../database/entities/client-invoice.entity';
import { TaxRule, TaxRuleStatus } from '../database/entities/tax-rule.entity';
import { Trip } from '../database/entities/trip.entity';
import { ActivitiesService } from './activities.service';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ClientInvoicesService {
  constructor(
    @InjectRepository(ClientInvoice)
    private readonly invoiceRepo: Repository<ClientInvoice>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(Trip)
    private readonly tripRepo: Repository<Trip>,
    @InjectRepository(TaxRule)
    private readonly taxRuleRepo: Repository<TaxRule>,
    private readonly dataSource: DataSource,
    private readonly activitiesService: ActivitiesService,
    private readonly configService: ConfigService,
  ) {}

  async create(dto: CreateClientInvoiceDto, activity?: ActivityActorContext) {
    await this.ensureClient(dto.clientId);
    await this.validateItems(dto.clientId, dto.items);

    const totals = this.sumItemTotals(dto.items);
    const invoiceNumber = await this.generateUniqueInvoiceNumber();

    const savedId = await this.dataSource.transaction(async (manager) => {
      const invoice = await manager.save(
        manager.create(ClientInvoice, {
          clientId: dto.clientId,
          invoiceNumber,
          invoiceDate: this.toDateOnly(dto.invoiceDate),
          invoiceStatus: ClientInvoiceStatus.PENDING,
          freightAmount: totals.freightAmount,
          salesTaxAmount: totals.salesTaxAmount,
          withHoldingTaxAmount: totals.withHoldingTaxAmount,
          netAmount: totals.netAmount,
          note: this.nullableTrim(dto.note),
        }),
      );

      await manager.save(
        dto.items.map((item) =>
          manager.create(ClientInvoiceItem, {
            invoiceId: invoice.id,
            ...this.buildItemPayload(item),
          }),
        ),
      );

      return invoice.id;
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.CREATE,
        module: ActivityModule.FINANCE,
        entityType: 'ClientInvoice',
        entityId: savedId,
        record: invoiceNumber,
        description: `Created client invoice ${invoiceNumber}`,
      },
      activity,
    );

    return this.findOne(savedId);
  }

  async findAll(query: ClientInvoiceListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.invoiceRepo
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.client', 'client')
      .orderBy('invoice.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.invoiceStatus) {
      qb.andWhere('invoice.invoiceStatus = :invoiceStatus', {
        invoiceStatus: query.invoiceStatus,
      });
    }
    if (query.clientId) {
      qb.andWhere('invoice.clientId = :clientId', {
        clientId: query.clientId,
      });
    }
    if (query.dateFrom) {
      qb.andWhere('invoice.invoiceDate >= :dateFrom', {
        dateFrom: query.dateFrom.slice(0, 10),
      });
    }
    if (query.dateTo) {
      qb.andWhere('invoice.invoiceDate <= :dateTo', {
        dateTo: query.dateTo.slice(0, 10),
      });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          invoice.invoiceNumber ILIKE :search
          OR invoice.note ILIKE :search
          OR client.companyName ILIKE :search
          OR client.email ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    const [rows, total] = await qb.getManyAndCount();

    return {
      data: rows.map((row) => this.toListResponse(row)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string) {
    return this.toDetailResponse(await this.findByIdOrFail(id));
  }

  /**
   * Unauthenticated public view by invoice number (e.g. CI000001) or UUID.
   * FE page: `{FRONTEND_URL}/public/client-invoices/{invoiceNumber}`
   */
  async findPublic(codeOrId: string) {
    const invoice = await this.findByCodeOrIdOrFail(codeOrId);
    return this.toPublicResponse(invoice);
  }

  /** QR PNG that encodes the frontend public invoice URL. */
  async getPublicQrPng(codeOrId: string): Promise<{
    buffer: Buffer;
    filename: string;
    invoiceNumber: string;
    publicUrl: string;
  }> {
    const invoice = await this.findByCodeOrIdOrFail(codeOrId);
    const publicUrl = this.buildPublicUrl(invoice.invoiceNumber);
    const buffer = await QRCode.toBuffer(publicUrl, {
      type: 'png',
      width: 256,
      margin: 1,
      errorCorrectionLevel: 'M',
    });
    return {
      buffer,
      filename: `${invoice.invoiceNumber}-qr.png`,
      invoiceNumber: invoice.invoiceNumber,
      publicUrl,
    };
  }

  async update(
    id: string,
    dto: UpdateClientInvoiceDto,
    activity?: ActivityActorContext,
  ) {
    const invoice = await this.findByIdOrFail(id);
    if (invoice.invoiceStatus !== ClientInvoiceStatus.PENDING) {
      throw new BadRequestException(
        'Only PENDING client invoices can be updated',
      );
    }

    const nextClientId = dto.clientId ?? invoice.clientId;
    if (dto.clientId !== undefined) {
      await this.ensureClient(dto.clientId);
    }

    if (dto.items !== undefined) {
      await this.validateItems(nextClientId, dto.items);
      const totals = this.sumItemTotals(dto.items);

      await this.dataSource.transaction(async (manager) => {
        invoice.clientId = nextClientId;
        if (dto.invoiceDate !== undefined) {
          invoice.invoiceDate = this.toDateOnly(dto.invoiceDate);
        }
        if (dto.note !== undefined) {
          invoice.note = this.nullableTrim(dto.note);
        }
        invoice.freightAmount = totals.freightAmount;
        invoice.salesTaxAmount = totals.salesTaxAmount;
        invoice.withHoldingTaxAmount = totals.withHoldingTaxAmount;
        invoice.netAmount = totals.netAmount;

        await manager.save(invoice);
        await manager.delete(ClientInvoiceItem, { invoiceId: id });
        await manager.save(
          dto.items!.map((item) =>
            manager.create(ClientInvoiceItem, {
              invoiceId: id,
              ...this.buildItemPayload(item),
            }),
          ),
        );
      });
    } else {
      if (dto.clientId !== undefined) invoice.clientId = dto.clientId;
      if (dto.invoiceDate !== undefined) {
        invoice.invoiceDate = this.toDateOnly(dto.invoiceDate);
      }
      if (dto.note !== undefined) {
        invoice.note = this.nullableTrim(dto.note);
      }
      await this.invoiceRepo.save(invoice);
    }

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.FINANCE,
        entityType: 'ClientInvoice',
        entityId: id,
        record: invoice.invoiceNumber,
        description: `Updated client invoice ${invoice.invoiceNumber}`,
      },
      activity,
    );

    return this.findOne(id);
  }

  async changeStatus(
    id: string,
    dto: ChangeClientInvoiceStatusDto,
    activity?: ActivityActorContext,
  ) {
    const invoice = await this.findByIdOrFail(id);
    this.assertStatusTransition(invoice.invoiceStatus, dto.status);

    invoice.invoiceStatus = dto.status;
    await this.invoiceRepo.save(invoice);

    await this.activitiesService.logAction(
      {
        action:
          dto.status === ClientInvoiceStatus.PAID
            ? ActivityAction.APPROVE
            : ActivityAction.UPDATE,
        module: ActivityModule.FINANCE,
        entityType: 'ClientInvoice',
        entityId: id,
        record: invoice.invoiceNumber,
        description: `Changed client invoice ${invoice.invoiceNumber} status to ${dto.status}`,
        metadata: { status: dto.status },
      },
      activity,
    );

    return this.findOne(id);
  }

  /**
   * Lightweight options for dropdowns (default PENDING).
   */
  async listUtility(
    opts: {
      search?: string;
      clientId?: string;
      invoiceStatus?: ClientInvoiceStatus;
    } = {},
  ) {
    const qb = this.invoiceRepo
      .createQueryBuilder('invoice')
      .leftJoin('invoice.client', 'client')
      .select([
        'invoice.id',
        'invoice.invoiceNumber',
        'invoice.invoiceDate',
        'invoice.invoiceStatus',
        'invoice.netAmount',
        'invoice.clientId',
      ])
      .addSelect(['client.id', 'client.companyName'])
      .orderBy('invoice.createdAt', 'DESC');

    qb.andWhere('invoice.invoiceStatus = :invoiceStatus', {
      invoiceStatus: opts.invoiceStatus ?? ClientInvoiceStatus.PENDING,
    });

    if (opts.clientId) {
      qb.andWhere('invoice.clientId = :clientId', {
        clientId: opts.clientId,
      });
    }

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          invoice.invoiceNumber ILIKE :search
          OR client.companyName ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    const rows = await qb.getMany();

    return {
      data: rows.map((inv) => ({
        id: inv.id,
        label: inv.invoiceNumber,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: this.toDateString(inv.invoiceDate),
        invoiceStatus: inv.invoiceStatus,
        netAmount: this.formatMoney(inv.netAmount),
        clientId: inv.clientId,
        clientName: inv.client?.companyName ?? null,
        publicUrl: this.buildPublicUrl(inv.invoiceNumber),
        qrUrl: `/public/client-invoices/${encodeURIComponent(inv.invoiceNumber)}/qr`,
        pdfUrl: `/public/client-invoices/${encodeURIComponent(inv.invoiceNumber)}/pdf`,
      })),
    };
  }

  private async validateItems(
    clientId: string,
    items: CreateClientInvoiceItemDto[],
  ) {
    const tripIds = [...new Set(items.map((i) => i.tripId))];
    const taxRuleIds = [
      ...new Set(
        items.flatMap((i) => [i.saleTaxRuleId, i.withholdingTaxRuleId]),
      ),
    ];

    const [trips, taxRules] = await Promise.all([
      this.tripRepo.find({ where: { id: In(tripIds) } }),
      this.taxRuleRepo.find({ where: { id: In(taxRuleIds) } }),
    ]);

    if (trips.length !== tripIds.length) {
      throw new BadRequestException('One or more trips were not found');
    }
    if (taxRules.length !== taxRuleIds.length) {
      throw new BadRequestException('One or more tax rules were not found');
    }

    const inactiveTax = taxRules.find(
      (rule) => rule.status !== TaxRuleStatus.ACTIVE,
    );
    if (inactiveTax) {
      throw new BadRequestException(
        `Tax rule ${inactiveTax.code} is not ACTIVE`,
      );
    }

    const matchingTrips = await this.tripRepo
      .createQueryBuilder('trip')
      .where('trip.id IN (:...tripIds)', { tripIds })
      .andWhere(
        `(
          EXISTS (
            SELECT 1 FROM trip_upcountry_loads ul
            WHERE ul."tripId" = trip.id AND ul."clientId" = :clientId
          )
          OR EXISTS (
            SELECT 1 FROM trip_downcountry_loads dl
            WHERE dl."tripId" = trip.id AND dl."clientId" = :clientId
          )
        )`,
        { clientId },
      )
      .getCount();

    if (matchingTrips !== tripIds.length) {
      throw new BadRequestException(
        'One or more trips do not belong to the selected client',
      );
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const freight = this.toMoneyNumber(item.freightAmount, `items[${i}].freightAmount`);
      const salesTax = this.toMoneyNumber(
        item.salesTaxAmount,
        `items[${i}].salesTaxAmount`,
      );
      const wht = this.toMoneyNumber(
        item.withholdingTaxAmount,
        `items[${i}].withholdingTaxAmount`,
      );
      const net = this.toMoneyNumber(item.netAmount, `items[${i}].netAmount`);
      const expectedNet = this.roundMoney(freight + salesTax - wht);
      if (net !== expectedNet) {
        throw new BadRequestException(
          `items[${i}].netAmount must equal freightAmount + salesTaxAmount - withholdingTaxAmount (${expectedNet.toFixed(2)})`,
        );
      }
    }
  }

  private buildItemPayload(
    item: CreateClientInvoiceItemDto,
  ): Partial<ClientInvoiceItem> {
    return {
      tripId: item.tripId,
      freightAmount: this.formatMoney(item.freightAmount),
      saleTaxRuleId: item.saleTaxRuleId,
      saleTaxRate: this.formatRate(item.saleTaxRate),
      salesTaxAmount: this.formatMoney(item.salesTaxAmount),
      withholdingTaxRuleId: item.withholdingTaxRuleId,
      withholdingTaxRate: this.formatRate(item.withholdingTaxRate),
      withholdingTaxAmount: this.formatMoney(item.withholdingTaxAmount),
      netAmount: this.formatMoney(item.netAmount),
    };
  }

  private sumItemTotals(items: CreateClientInvoiceItemDto[]) {
    let freight = 0;
    let salesTax = 0;
    let wht = 0;
    let net = 0;

    for (const item of items) {
      freight += Number(item.freightAmount);
      salesTax += Number(item.salesTaxAmount);
      wht += Number(item.withholdingTaxAmount);
      net += Number(item.netAmount);
    }

    return {
      freightAmount: this.formatMoney(freight),
      salesTaxAmount: this.formatMoney(salesTax),
      withHoldingTaxAmount: this.formatMoney(wht),
      netAmount: this.formatMoney(net),
    };
  }

  private assertStatusTransition(
    current: ClientInvoiceStatus,
    next: ClientInvoiceStatus,
  ) {
    if (current === next) {
      throw new BadRequestException(`Invoice is already ${current}`);
    }
    if (current === ClientInvoiceStatus.CANCELLED) {
      throw new BadRequestException(
        'Cancelled invoices cannot change status',
      );
    }
    if (current === ClientInvoiceStatus.PAID) {
      throw new BadRequestException('Paid invoices cannot change status');
    }
    if (
      next !== ClientInvoiceStatus.PAID &&
      next !== ClientInvoiceStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Pending invoices can only move to paid or cancelled',
      );
    }
  }

  private async ensureClient(clientId: string) {
    const client = await this.clientRepo.findOne({ where: { id: clientId } });
    if (!client) {
      throw new BadRequestException('Client not found');
    }
    if (client.status === ClientStatus.INACTIVE) {
      throw new BadRequestException('Client is inactive');
    }
    return client;
  }

  private async findByIdOrFail(id: string): Promise<ClientInvoice> {
    const invoice = await this.invoiceRepo.findOne({
      where: { id },
      relations: {
        client: true,
        items: {
          trip: true,
          saleTaxRule: true,
          withholdingTaxRule: true,
        },
      },
      order: {
        items: {
          createdAt: 'ASC',
        },
      },
    });
    if (!invoice) {
      throw new NotFoundException('Client invoice not found');
    }
    return invoice;
  }

  private async findByCodeOrIdOrFail(
    codeOrId: string,
  ): Promise<ClientInvoice> {
    const key = codeOrId.trim();
    if (!key) {
      throw new NotFoundException('Client invoice not found');
    }

    const invoice = UUID_RE.test(key)
      ? await this.findByIdOrFail(key)
      : await this.invoiceRepo.findOne({
          where: { invoiceNumber: key.toUpperCase() },
          relations: {
            client: true,
            items: {
              trip: true,
              saleTaxRule: true,
              withholdingTaxRule: true,
            },
          },
          order: {
            items: {
              createdAt: 'ASC',
            },
          },
        });

    if (!invoice) {
      throw new NotFoundException('Client invoice not found');
    }
    return invoice;
  }

  /** Frontend public page URL encoded into the QR. */
  buildPublicUrl(invoiceNumber: string): string {
    const frontendBase = (
      this.configService.get<string>('FRONTEND_URL') ||
      this.configService.get<string>('APP_URL') ||
      'http://localhost:5173'
    ).replace(/\/$/, '');
    return `${frontendBase}/public/client-invoices/${encodeURIComponent(invoiceNumber)}`;
  }

  private async generateUniqueInvoiceNumber(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = await nextSerialCode(
        this.invoiceRepo,
        CLIENT_INVOICE_PREFIX,
        'invoiceNumber',
        6,
        attempt,
      );
      const existing = await this.invoiceRepo.findOne({
        where: { invoiceNumber: code },
      });
      if (!existing) return code;
    }
    throw new BadRequestException(
      'Could not generate unique client invoice number',
    );
  }

  private toListResponse(invoice: ClientInvoice) {
    const publicUrl = this.buildPublicUrl(invoice.invoiceNumber);
    return {
      id: invoice.id,
      clientId: invoice.clientId,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: this.toDateString(invoice.invoiceDate),
      invoiceStatus: invoice.invoiceStatus,
      freightAmount: this.formatMoney(invoice.freightAmount),
      salesTaxAmount: this.formatMoney(invoice.salesTaxAmount),
      withHoldingTaxAmount: this.formatMoney(invoice.withHoldingTaxAmount),
      netAmount: this.formatMoney(invoice.netAmount),
      note: invoice.note ?? null,
      publicUrl,
      qrUrl: `/public/client-invoices/${encodeURIComponent(invoice.invoiceNumber)}/qr`,
      pdfUrl: `/public/client-invoices/${encodeURIComponent(invoice.invoiceNumber)}/pdf`,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
      client: invoice.client
        ? {
            id: invoice.client.id,
            companyName: invoice.client.companyName,
            email: invoice.client.email,
          }
        : null,
    };
  }

  private toDetailResponse(invoice: ClientInvoice) {
    return {
      ...this.toListResponse(invoice),
      items: (invoice.items ?? []).map((item) => this.toItemResponse(item)),
    };
  }

  private toPublicResponse(invoice: ClientInvoice) {
    return {
      ...this.toDetailResponse(invoice),
      isPublic: true as const,
    };
  }

  private toItemResponse(item: ClientInvoiceItem) {
    return {
      id: item.id,
      invoiceId: item.invoiceId,
      tripId: item.tripId,
      freightAmount: this.formatMoney(item.freightAmount),
      saleTaxRuleId: item.saleTaxRuleId,
      saleTaxRate: this.formatRate(item.saleTaxRate),
      salesTaxAmount: this.formatMoney(item.salesTaxAmount),
      withholdingTaxRuleId: item.withholdingTaxRuleId,
      withholdingTaxRate: this.formatRate(item.withholdingTaxRate),
      withholdingTaxAmount: this.formatMoney(item.withholdingTaxAmount),
      netAmount: this.formatMoney(item.netAmount),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      trip: item.trip
        ? {
            id: item.trip.id,
            tripCode: item.trip.tripCode,
            tripDate: this.toDateString(item.trip.tripDate),
            status: item.trip.status,
          }
        : null,
      saleTaxRule: item.saleTaxRule
        ? {
            id: item.saleTaxRule.id,
            code: item.saleTaxRule.code,
            authority: item.saleTaxRule.authority,
            rate: item.saleTaxRule.rate,
            withHeldtaxRate: item.saleTaxRule.withHeldtaxRate ?? null,
          }
        : null,
      withholdingTaxRule: item.withholdingTaxRule
        ? {
            id: item.withholdingTaxRule.id,
            code: item.withholdingTaxRule.code,
            authority: item.withholdingTaxRule.authority,
            rate: item.withholdingTaxRule.rate,
            withHeldtaxRate: item.withholdingTaxRule.withHeldtaxRate ?? null,
          }
        : null,
    };
  }

  private toMoneyNumber(value: number, field: string): number {
    const n = this.roundMoney(Number(value));
    if (!Number.isFinite(n) || n < 0) {
      throw new BadRequestException(`${field} must be a valid amount >= 0`);
    }
    return n;
  }

  private roundMoney(value: number): number {
    return Math.round(Number(value) * 100) / 100;
  }

  private formatMoney(value: number | string): string {
    return this.roundMoney(Number(value)).toFixed(2);
  }

  private formatRate(value: number | string): string {
    return Number(value).toFixed(2);
  }

  private toDateOnly(value: string | Date): Date {
    if (typeof value === 'string') {
      return value.slice(0, 10) as unknown as Date;
    }
    return value;
  }

  private toDateString(value: string | Date | null | undefined): string | null {
    if (value === undefined || value === null) return null;
    return String(value).slice(0, 10);
  }

  private nullableTrim(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
}
