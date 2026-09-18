import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as QRCode from 'qrcode';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
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
  COA_PARENT_CODES,
  COA_SYSTEM_CODES,
} from '../database/chart-of-accounts/constants/coa-parent-codes';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import {
  ChartOfAccount,
  ChartOfAccountKind,
} from '../database/entities/chart-of-account.entity';
import { Client, ClientStatus } from '../database/entities/client.entity';
import {
  ClientInvoice,
  ClientInvoiceItem,
  ClientInvoiceStatus,
} from '../database/entities/client-invoice.entity';
import { TaxRule, TaxRuleStatus } from '../database/entities/tax-rule.entity';
import {
  AccountTransactionReferenceType,
} from '../database/entities/transaction.entity';
import { Trip } from '../database/entities/trip.entity';
import { ActivitiesService } from './activities.service';
import { ChartOfAccountsService } from './chart-of-accounts.service';
import { TransactionsService } from './transactions.service';

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
    @InjectRepository(ChartOfAccount)
    private readonly coaRepo: Repository<ChartOfAccount>,
    private readonly dataSource: DataSource,
    private readonly activitiesService: ActivitiesService,
    private readonly configService: ConfigService,
    private readonly chartOfAccountsService: ChartOfAccountsService,
    private readonly transactionsService: TransactionsService,
  ) {}

  async create(dto: CreateClientInvoiceDto, activity?: ActivityActorContext) {
    const client = await this.ensureClient(dto.clientId);
    const items = this.applySaleTaxWithheld(client, dto.items);
    await this.validateItems(dto.clientId, items);

    const totals = this.sumItemTotals(items);
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
          saleTaxWithheldAmount: totals.saleTaxWithheldAmount,
          netAmount: totals.netAmount,
          note: this.nullableTrim(dto.note),
        }),
      );

      await manager.save(
        items.map((item) =>
          manager.create(ClientInvoiceItem, {
            invoiceId: invoice.id,
            ...this.buildItemPayload(item),
          }),
        ),
      );

      await this.postInvoiceCreateLedger(invoice, client.companyName, manager);

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

    const clientChanged =
      dto.clientId !== undefined && dto.clientId !== invoice.clientId;
    const dateChanging = dto.invoiceDate !== undefined;

    if (dto.items !== undefined) {
      const nextClient = await this.ensureClient(nextClientId);
      const items = this.applySaleTaxWithheld(nextClient, dto.items);
      await this.validateItems(nextClientId, items);
      const totals = this.sumItemTotals(items);

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
        invoice.saleTaxWithheldAmount = totals.saleTaxWithheldAmount;
        invoice.netAmount = totals.netAmount;

        await manager.save(invoice);
        await manager.delete(ClientInvoiceItem, { invoiceId: id });
        await manager.save(
          items.map((item) =>
            manager.create(ClientInvoiceItem, {
              invoiceId: id,
              ...this.buildItemPayload(item),
            }),
          ),
        );

        await this.clearInvoiceCreateLedger(id, manager);
        await this.postInvoiceCreateLedger(
          invoice,
          nextClient.companyName,
          manager,
        );
      });
    } else {
      const nextClient = clientChanged
        ? await this.ensureClient(dto.clientId!)
        : invoice.client ?? (await this.ensureClient(invoice.clientId));

      if (dto.clientId !== undefined) invoice.clientId = dto.clientId;
      if (dto.invoiceDate !== undefined) {
        invoice.invoiceDate = this.toDateOnly(dto.invoiceDate);
      }
      if (dto.note !== undefined) {
        invoice.note = this.nullableTrim(dto.note);
      }

      if (clientChanged || dateChanging) {
        await this.dataSource.transaction(async (manager) => {
          await manager.save(invoice);
          await this.clearInvoiceCreateLedger(id, manager);
          await this.postInvoiceCreateLedger(
            invoice,
            nextClient.companyName,
            manager,
          );
        });
      } else {
        await this.invoiceRepo.save(invoice);
      }
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

    if (dto.status === ClientInvoiceStatus.CANCELLED) {
      await this.dataSource.transaction(async (manager) => {
        invoice.invoiceStatus = ClientInvoiceStatus.CANCELLED;
        await manager.save(invoice);
        await this.clearInvoiceCreateLedger(id, manager);
      });
    } else {
      // paid = status only; bank/AR clear happens via client voucher payment
      invoice.invoiceStatus = dto.status;
      await this.invoiceRepo.save(invoice);
    }

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

      const withheldPct = this.roundRate(Number(item.saleTaxWithheldPercent ?? 0));
      const withheldAmt = this.toMoneyNumber(
        item.saleTaxWithheldAmount ?? 0,
        `items[${i}].saleTaxWithheldAmount`,
      );
      const expectedWithheld = this.roundMoney((salesTax * withheldPct) / 100);
      if (withheldAmt !== expectedWithheld) {
        throw new BadRequestException(
          `items[${i}].saleTaxWithheldAmount must equal salesTaxAmount × saleTaxWithheldPercent / 100 (${expectedWithheld.toFixed(2)})`,
        );
      }
    }
  }

  /**
   * Snapshot sale-tax withheld %/amount from client's withHeldtaxRate.
   * FE may omit — server fills. If FE sends values, they must match client config.
   */
  private applySaleTaxWithheld(
    client: Client,
    items: CreateClientInvoiceItemDto[],
  ): CreateClientInvoiceItemDto[] {
    const heldBySaleTaxId = new Map<string, number>();
    for (const row of client.withHeldtaxRate ?? []) {
      if (!row?.saleTaxTypeId || row.percent == null) continue;
      const n = Number(row.percent);
      if (Number.isFinite(n)) heldBySaleTaxId.set(row.saleTaxTypeId, n);
    }

    return items.map((item, i) => {
      const clientPercent = heldBySaleTaxId.has(item.saleTaxRuleId)
        ? this.roundRate(heldBySaleTaxId.get(item.saleTaxRuleId)!)
        : 0;

      if (item.saleTaxWithheldPercent !== undefined) {
        const sent = this.roundRate(Number(item.saleTaxWithheldPercent));
        if (sent !== clientPercent) {
          throw new BadRequestException(
            `items[${i}].saleTaxWithheldPercent must be ${clientPercent} (client withHeld for this sale tax)`,
          );
        }
      }

      const salesTax = this.roundMoney(Number(item.salesTaxAmount));
      const expectedAmount = this.roundMoney(
        (salesTax * clientPercent) / 100,
      );

      if (
        item.saleTaxWithheldAmount !== undefined &&
        this.roundMoney(Number(item.saleTaxWithheldAmount)) !== expectedAmount
      ) {
        throw new BadRequestException(
          `items[${i}].saleTaxWithheldAmount must be ${expectedAmount.toFixed(2)} (${clientPercent}% of sales tax)`,
        );
      }

      return {
        ...item,
        saleTaxWithheldPercent: clientPercent,
        saleTaxWithheldAmount: expectedAmount,
      };
    });
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
      saleTaxWithheldPercent: this.formatWithheldRate(
        item.saleTaxWithheldPercent ?? 0,
      ),
      saleTaxWithheldAmount: this.formatMoney(item.saleTaxWithheldAmount ?? 0),
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
    let saleTaxWithheld = 0;
    let net = 0;

    for (const item of items) {
      freight += Number(item.freightAmount);
      salesTax += Number(item.salesTaxAmount);
      wht += Number(item.withholdingTaxAmount);
      saleTaxWithheld += Number(item.saleTaxWithheldAmount ?? 0);
      net += Number(item.netAmount);
    }

    return {
      freightAmount: this.formatMoney(freight),
      salesTaxAmount: this.formatMoney(salesTax),
      withHoldingTaxAmount: this.formatMoney(wht),
      saleTaxWithheldAmount: this.formatMoney(saleTaxWithheld),
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

  /**
   * Invoice create accrual:
   * Dr Client AR (freight + sales tax)
   * Cr Freight Revenue
   * Cr Sales Tax Payable
   * Payment / AR clear happens later via client voucher (not on invoice paid).
   */
  private async postInvoiceCreateLedger(
    invoice: ClientInvoice,
    clientCompanyName: string,
    manager: EntityManager,
  ) {
    const freight = this.roundMoney(Number(invoice.freightAmount));
    const salesTax = this.roundMoney(Number(invoice.salesTaxAmount));
    const gross = this.roundMoney(freight + salesTax);

    if (gross <= 0 && freight <= 0 && salesTax <= 0) {
      return;
    }

    const arAccount = await this.resolveClientReceivable(
      clientCompanyName,
      manager,
    );
    const revenueAccount = await this.resolveSystemAccount(
      COA_SYSTEM_CODES.FREIGHT_REVENUE,
      manager,
    );
    const taxAccount = await this.resolveSystemAccount(
      COA_SYSTEM_CODES.SALES_TAX_PAYABLE,
      manager,
    );

    const date = invoice.invoiceDate;
    const desc =
      invoice.note?.trim() ||
      `Client invoice ${invoice.invoiceNumber}`;

    if (gross > 0) {
      await this.transactionsService.postEntry(
        {
          chartOfAccountId: arAccount.id,
          referenceType: AccountTransactionReferenceType.CLIENT_INVOICE_AR,
          referenceId: invoice.id,
          transactionDate: date,
          description: desc,
          debitAmount: gross,
          idempotent: true,
        },
        manager,
      );
    }

    if (freight > 0) {
      await this.transactionsService.postEntry(
        {
          chartOfAccountId: revenueAccount.id,
          referenceType: AccountTransactionReferenceType.CLIENT_INVOICE_REVENUE,
          referenceId: invoice.id,
          transactionDate: date,
          description: desc,
          creditAmount: freight,
          idempotent: true,
        },
        manager,
      );
    }

    if (salesTax > 0) {
      await this.transactionsService.postEntry(
        {
          chartOfAccountId: taxAccount.id,
          referenceType: AccountTransactionReferenceType.CLIENT_INVOICE_TAX,
          referenceId: invoice.id,
          transactionDate: date,
          description: desc,
          creditAmount: salesTax,
          idempotent: true,
        },
        manager,
      );
    }
  }

  private async clearInvoiceCreateLedger(
    invoiceId: string,
    manager: EntityManager,
  ) {
    const refs = [
      AccountTransactionReferenceType.CLIENT_INVOICE_AR,
      AccountTransactionReferenceType.CLIENT_INVOICE_REVENUE,
      AccountTransactionReferenceType.CLIENT_INVOICE_TAX,
    ];
    for (const referenceType of refs) {
      await this.transactionsService.deleteReferencedEntry(
        { referenceType, referenceId: invoiceId },
        manager,
      );
    }
  }

  private async resolveClientReceivable(
    companyName: string,
    manager: EntityManager,
  ): Promise<ChartOfAccount> {
    return this.chartOfAccountsService.syncLinkedLeafName(
      COA_PARENT_CODES.CUSTOMER_RECEIVABLES,
      companyName,
      companyName,
      ChartOfAccountKind.PARTY_RECEIVABLE,
      manager,
    );
  }

  private async resolveSystemAccount(
    code: string,
    manager?: EntityManager,
  ): Promise<ChartOfAccount> {
    const repo = manager
      ? manager.getRepository(ChartOfAccount)
      : this.coaRepo;
    const account = await repo.findOne({ where: { code } });
    if (!account) {
      throw new BadRequestException(
        `System account ${code} not found. Run COA seeder / migration.`,
      );
    }
    if (!account.isPostable) {
      throw new BadRequestException(
        `System account ${code} is not postable`,
      );
    }
    return account;
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
      saleTaxWithheldAmount: this.formatMoney(
        invoice.saleTaxWithheldAmount ?? 0,
      ),
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
      saleTaxWithheldPercent: this.formatWithheldRate(
        item.saleTaxWithheldPercent ?? 0,
      ),
      saleTaxWithheldAmount: this.formatMoney(
        item.saleTaxWithheldAmount ?? 0,
      ),
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

  private roundRate(value: number): number {
    return Math.round(Number(value) * 10000) / 10000;
  }

  private formatWithheldRate(value: number | string): string {
    return this.roundRate(Number(value)).toFixed(4);
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
