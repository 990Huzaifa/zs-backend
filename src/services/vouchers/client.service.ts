import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  ChangeClientVoucherStatusDto,
  CreateClientVoucherBatchDto,
  CreateClientVoucherEntryDto,
  ClientVoucherListQueryDto,
  RemoveClientVoucherProofImageDto,
  UpdateClientVoucherDto,
} from '../../auth/dto/client-voucher.dto';
import { ActivityActorContext } from '../../common/activity/activity-context';
import { S3Service } from '../../common/s3/s3.service';
import {
  CLIENT_VOUCHER_PREFIX,
  nextSerialCode,
} from '../../common/utils/serial-code.util';
import {
  buildPublicApiLinks,
  buildPublicQrPngBuffer,
  parseCodeOrId,
} from '../../common/utils/public-link.util';
import { COA_PARENT_CODES } from '../../database/chart-of-accounts/constants/coa-parent-codes';
import {
  ActivityAction,
  ActivityModule,
} from '../../database/entities/activity.entity';
import {
  ChartOfAccount,
  ChartOfAccountKind,
} from '../../database/entities/chart-of-account.entity';
import {
  Client,
  ClientStatus,
} from '../../database/entities/client.entity';
import {
  ClientInvoice,
  ClientInvoiceStatus,
} from '../../database/entities/client-invoice.entity';
import { ClientVoucher } from '../../database/entities/client-voucher.entity';
import { AccountTransactionReferenceType } from '../../database/entities/transaction.entity';
import {
  PaymentMethod,
  VoucherStatus,
} from '../../database/entities/voucher.entity';
import { ActivitiesService } from '../activities.service';
import { ChartOfAccountsService } from '../chart-of-accounts.service';
import { TransactionsService } from '../transactions.service';
import { randomUUID } from 'crypto';

@Injectable()
export class ClientVouchersService {
  constructor(
    @InjectRepository(ClientVoucher)
    private readonly voucherRepo: Repository<ClientVoucher>,
    @InjectRepository(ChartOfAccount)
    private readonly coaRepo: Repository<ChartOfAccount>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(ClientInvoice)
    private readonly invoiceRepo: Repository<ClientInvoice>,
    private readonly dataSource: DataSource,
    private readonly transactionsService: TransactionsService,
    private readonly chartOfAccountsService: ChartOfAccountsService,
    private readonly activitiesService: ActivitiesService,
    private readonly s3Service: S3Service,
  ) {}

  /**
   * Batch create — PENDING = draft; PAID = insert + post ledger.
   * Client party COA is resolved from `clientId` (not stored on voucher).
   */
  async createBatch(
    dto: CreateClientVoucherBatchDto,
    activity?: ActivityActorContext,
  ) {
    if (
      dto.status !== VoucherStatus.PENDING &&
      dto.status !== VoucherStatus.PAID
    ) {
      throw new BadRequestException(
        'Batch create status must be PENDING or PAID',
      );
    }

    for (let i = 0; i < dto.entries.length; i++) {
      const entry = dto.entries[i];
      try {
        await this.validateClient(entry.clientId);
        await this.validateAssetAccount(entry.assetAccId);
        await this.validateClientInvoice(
          entry.clientId,
          entry.clientInvoiceId,
        );
        this.validateChequeFields(
          entry.paymentMethod,
          entry.chequeNumber,
          entry.chequeDate,
          entry.chequeBank,
        );
        this.formatAmount(entry.paymentAmount);
      } catch (err) {
        if (err instanceof BadRequestException) {
          throw new BadRequestException(`entries[${i}]: ${err.message}`);
        }
        throw err;
      }
    }

    const createdBy = activity?.actor?.id ?? null;

    const savedIds = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ClientVoucher);
      const ids: string[] = [];

      for (let i = 0; i < dto.entries.length; i++) {
        const entry = dto.entries[i];
        const voucherNumber = await this.generateUniqueVoucherNumber(repo, i);
        const row = await repo.save(
          repo.create(
            this.buildEntityPayload(entry, {
              voucherNumber,
              status: dto.status,
              createdBy,
            }),
          ),
        );
        ids.push(row.id);

        if (dto.status === VoucherStatus.PAID) {
          await this.postClientLedger(row, manager);
          await this.markLinkedInvoiceReceived(row, manager);
        }
      }

      return ids;
    });

    const rows = await this.voucherRepo.find({
      where: { id: In(savedIds) },
      relations: {
        client: true,
        assetAcc: true,
        clientInvoice: true,
        createdByUser: true,
      },
      order: { voucherNumber: 'ASC' },
    });

    const numbers = rows.map((r) => r.voucherNumber).join(', ');
    await this.activitiesService.logAction(
      {
        action:
          dto.status === VoucherStatus.PAID
            ? ActivityAction.APPROVE
            : ActivityAction.CREATE,
        module: ActivityModule.FINANCE,
        entityType: 'ClientVoucher',
        entityId: rows[0]?.id ?? null,
        record: numbers,
        description:
          dto.status === VoucherStatus.PAID
            ? `Created and paid ${rows.length} client voucher(s): ${numbers}`
            : `Created ${rows.length} client voucher draft(s): ${numbers}`,
        metadata: { status: dto.status, count: rows.length, ids: savedIds },
      },
      activity,
    );

    return {
      data: await Promise.all(rows.map((row) => this.toResponse(row))),
    };
  }

  async findAll(query: ClientVoucherListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.voucherRepo
      .createQueryBuilder('voucher')
      .leftJoinAndSelect('voucher.client', 'client')
      .leftJoinAndSelect('voucher.assetAcc', 'assetAcc')
      .leftJoinAndSelect('voucher.clientInvoice', 'clientInvoice')
      .leftJoinAndSelect('voucher.createdByUser', 'createdByUser')
      .orderBy('voucher.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.status) {
      qb.andWhere('voucher.status = :status', { status: query.status });
    }
    if (query.paymentMethod) {
      qb.andWhere('voucher.paymentMethod = :paymentMethod', {
        paymentMethod: query.paymentMethod,
      });
    }
    if (query.clientId) {
      qb.andWhere('voucher.clientId = :clientId', { clientId: query.clientId });
    }
    if (query.clientInvoiceId) {
      qb.andWhere('voucher.clientInvoiceId = :clientInvoiceId', {
        clientInvoiceId: query.clientInvoiceId,
      });
    }
    if (query.assetAccId) {
      qb.andWhere('voucher.assetAccId = :assetAccId', {
        assetAccId: query.assetAccId,
      });
    }
    if (query.dateFrom) {
      qb.andWhere('voucher.paymentDate >= :dateFrom', {
        dateFrom: query.dateFrom.slice(0, 10),
      });
    }
    if (query.dateTo) {
      qb.andWhere('voucher.paymentDate <= :dateTo', {
        dateTo: query.dateTo.slice(0, 10),
      });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          voucher.voucherNumber ILIKE :search
          OR voucher.remarks ILIKE :search
          OR voucher.chequeNumber ILIKE :search
          OR voucher.chequeBank ILIKE :search
          OR client.companyName ILIKE :search
          OR assetAcc.name ILIKE :search
          OR assetAcc.code ILIKE :search
          OR clientInvoice.invoiceNumber ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    const [rows, total] = await qb.getManyAndCount();

    return {
      data: await Promise.all(rows.map((row) => this.toResponse(row))),
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

  /** Unauthenticated public view by voucher number (e.g. CLV000001) or UUID. */
  async findPublic(codeOrId: string) {
    return this.toResponse(await this.findByCodeOrIdOrFail(codeOrId));
  }

  async getPublicQrPng(codeOrId: string) {
    const voucher = await this.findByCodeOrIdOrFail(codeOrId);
    const links = buildPublicApiLinks('client-vouchers', voucher.voucherNumber);
    const buffer = await buildPublicQrPngBuffer(
      'client-vouchers',
      voucher.voucherNumber,
    );
    return {
      buffer,
      filename: `${voucher.voucherNumber}-qr.png`,
      voucherNumber: voucher.voucherNumber,
      publicUrl: links.publicUrl,
    };
  }

  /**
   * Edit PENDING (draft) or PAID (approved).
   * PAID updates remove old ledger lines and re-post.
   */
  async update(
    id: string,
    dto: UpdateClientVoucherDto,
    activity?: ActivityActorContext,
  ) {
    const updated = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ClientVoucher);
      const voucher = await repo.findOne({
        where: { id },
        relations: {
          client: true,
          assetAcc: true,
          clientInvoice: true,
          createdByUser: true,
        },
      });
      if (!voucher) {
        throw new NotFoundException('Client voucher not found');
      }
      if (voucher.status === VoucherStatus.CANCELLED) {
        throw new BadRequestException(
          'Cancelled client vouchers cannot be updated',
        );
      }

      const wasPaid = voucher.status === VoucherStatus.PAID;
      if (wasPaid) {
        await this.clearClientLedger(voucher.id, manager);
      }

      const nextClientId = dto.clientId ?? voucher.clientId;
      const nextAsset = dto.assetAccId ?? voucher.assetAccId;
      const nextInvoiceId =
        dto.clientInvoiceId !== undefined
          ? dto.clientInvoiceId
          : voucher.clientInvoiceId;

      if (dto.clientId !== undefined) {
        await this.validateClient(dto.clientId);
      }
      if (dto.assetAccId !== undefined) {
        await this.validateAssetAccount(nextAsset);
      }
      await this.validateClientInvoice(nextClientId, nextInvoiceId);

      const nextMethod = dto.paymentMethod ?? voucher.paymentMethod;
      const nextChequeNumber =
        dto.chequeNumber !== undefined
          ? this.nullableTrim(dto.chequeNumber)
          : voucher.chequeNumber;
      const nextChequeDate =
        dto.chequeDate !== undefined
          ? dto.chequeDate
            ? this.toDateOnly(dto.chequeDate)
            : null
          : voucher.chequeDate;
      const nextChequeBank =
        dto.chequeBank !== undefined
          ? this.nullableTrim(dto.chequeBank)
          : voucher.chequeBank;

      this.validateChequeFields(
        nextMethod,
        nextChequeNumber,
        nextChequeDate,
        nextChequeBank,
      );

      if (dto.clientId !== undefined) voucher.clientId = dto.clientId;
      if (dto.clientInvoiceId !== undefined) {
        voucher.clientInvoiceId = dto.clientInvoiceId;
      }
      if (dto.assetAccId !== undefined) voucher.assetAccId = dto.assetAccId;
      if (dto.paymentMethod !== undefined) {
        voucher.paymentMethod = dto.paymentMethod;
      }
      if (dto.paymentDate !== undefined) {
        voucher.paymentDate = this.toDateOnly(dto.paymentDate);
      }
      if (dto.paymentAmount !== undefined) {
        voucher.paymentAmount = this.formatAmount(
          dto.paymentAmount,
        ) as unknown as number;
      }
      if (dto.remarks !== undefined) {
        voucher.remarks = this.nullableTrim(dto.remarks);
      }

      if (nextMethod === PaymentMethod.CHEQUE) {
        voucher.chequeNumber = nextChequeNumber;
        voucher.chequeDate = nextChequeDate;
        voucher.chequeBank = nextChequeBank;
      } else {
        voucher.chequeNumber = null;
        voucher.chequeDate = null;
        voucher.chequeBank = null;
      }

      await repo.save(voucher);

      if (wasPaid) {
        await this.postClientLedger(voucher, manager);
      }

      return voucher;
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.FINANCE,
        entityType: 'ClientVoucher',
        entityId: id,
        record: updated.voucherNumber,
        description: `Updated client voucher ${updated.voucherNumber}`,
        metadata: { status: updated.status },
      },
      activity,
    );

    return this.findOne(id);
  }

  async changeStatus(
    id: string,
    dto: ChangeClientVoucherStatusDto,
    activity?: ActivityActorContext,
  ) {
    const result = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ClientVoucher);
      const voucher = await repo.findOne({
        where: { id },
        relations: {
          client: true,
          assetAcc: true,
          clientInvoice: true,
          createdByUser: true,
        },
      });
      if (!voucher) {
        throw new NotFoundException('Client voucher not found');
      }

      this.assertStatusTransition(voucher.status, dto.status);

      voucher.status = dto.status;
      await repo.save(voucher);

      if (dto.status === VoucherStatus.PAID) {
        await this.postClientLedger(voucher, manager);
        await this.markLinkedInvoiceReceived(voucher, manager);
      }

      return voucher;
    });

    await this.activitiesService.logAction(
      {
        action:
          dto.status === VoucherStatus.PAID
            ? ActivityAction.APPROVE
            : ActivityAction.UPDATE,
        module: ActivityModule.FINANCE,
        entityType: 'ClientVoucher',
        entityId: id,
        record: result.voucherNumber,
        description: `Changed client voucher ${result.voucherNumber} status to ${dto.status}`,
        metadata: { status: dto.status },
      },
      activity,
    );

    return this.findOne(id);
  }

  /** Hard delete — removes ledger lines if PAID, then deletes the row. */
  async remove(id: string, activity?: ActivityActorContext) {
    const voucher = await this.findByIdOrFail(id);
    const proofImages = voucher.proofImages ?? [];

    await this.dataSource.transaction(async (manager) => {
      if (voucher.status === VoucherStatus.PAID) {
        await this.clearClientLedger(voucher.id, manager);
      }
      await manager.getRepository(ClientVoucher).delete(id);
    });

    await this.deleteS3Keys(proofImages);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.DELETE,
        module: ActivityModule.FINANCE,
        entityType: 'ClientVoucher',
        entityId: id,
        record: voucher.voucherNumber,
        description: `Deleted client voucher ${voucher.voucherNumber}`,
        metadata: { status: voucher.status },
      },
      activity,
    );

    return { success: true, id, voucherNumber: voucher.voucherNumber };
  }

  async uploadProofImages(
    id: string,
    files?: Express.Multer.File[],
    activity?: ActivityActorContext,
  ) {
    if (!files?.length) {
      throw new BadRequestException('At least one image file is required');
    }

    const voucher = await this.findByIdOrFail(id);
    const keys: string[] = [];

    for (const file of files) {
      if (!file.mimetype.startsWith('image/')) {
        throw new BadRequestException(
          `File ${file.originalname} must be an image`,
        );
      }
      const ext = this.fileExtension(file.originalname, file.mimetype);
      const key = `client-vouchers/${id}/proof/${randomUUID()}${ext}`;
      await this.s3Service.uploadObject(key, file.buffer, file.mimetype);
      keys.push(key);
    }

    const current = voucher.proofImages ?? [];
    voucher.proofImages = [...current, ...keys];
    await this.voucherRepo.save(voucher);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.FINANCE,
        entityType: 'ClientVoucher',
        entityId: id,
        record: voucher.voucherNumber,
        description: `Uploaded ${keys.length} proof image(s) for client voucher ${voucher.voucherNumber}`,
        metadata: { keys },
      },
      activity,
    );

    return this.findOne(id);
  }

  async removeProofImage(
    id: string,
    dto: RemoveClientVoucherProofImageDto,
    activity?: ActivityActorContext,
  ) {
    const voucher = await this.findByIdOrFail(id);
    const key = dto.key.trim();
    const current = voucher.proofImages ?? [];
    if (!current.includes(key)) {
      throw new NotFoundException('Proof image not found');
    }

    await this.deleteS3Keys([key]);
    const next = current.filter((k) => k !== key);
    voucher.proofImages = next.length ? next : null;
    await this.voucherRepo.save(voucher);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.FINANCE,
        entityType: 'ClientVoucher',
        entityId: id,
        record: voucher.voucherNumber,
        description: `Removed proof image from client voucher ${voucher.voucherNumber}`,
        metadata: { key },
      },
      activity,
    );

    return this.findOne(id);
  }

  private buildEntityPayload(
    entry: CreateClientVoucherEntryDto,
    meta: {
      voucherNumber: string;
      status: VoucherStatus;
      createdBy: string | null;
    },
  ): Partial<ClientVoucher> {
    return {
      voucherNumber: meta.voucherNumber,
      clientId: entry.clientId,
      clientInvoiceId: entry.clientInvoiceId?.trim()
        ? entry.clientInvoiceId
        : null,
      assetAccId: entry.assetAccId,
      paymentMethod: entry.paymentMethod,
      chequeNumber:
        entry.paymentMethod === PaymentMethod.CHEQUE
          ? entry.chequeNumber!.trim()
          : null,
      chequeDate:
        entry.paymentMethod === PaymentMethod.CHEQUE
          ? this.toDateOnly(entry.chequeDate!)
          : null,
      chequeBank:
        entry.paymentMethod === PaymentMethod.CHEQUE
          ? entry.chequeBank!.trim()
          : null,
      paymentDate: this.toDateOnly(entry.paymentDate),
      paymentAmount: this.formatAmount(
        entry.paymentAmount,
      ) as unknown as number,
      remarks: this.nullableTrim(entry.remarks),
      proofImages: null,
      createdBy: meta.createdBy,
      status: meta.status,
    };
  }

  /**
   * Receipt: debit asset (in), credit client party AR (resolved from clientId).
   */
  private async postClientLedger(
    voucher: ClientVoucher,
    manager: EntityManager,
  ) {
    const amount = Number(voucher.paymentAmount);
    const date = voucher.paymentDate;
    const partyAcc = await this.resolveClientPartyAccount(
      voucher.clientId,
      manager,
    );

    let invoiceLabel = '';
    if (voucher.clientInvoiceId) {
      const invoice =
        voucher.clientInvoice ??
        (await manager.getRepository(ClientInvoice).findOne({
          where: { id: voucher.clientInvoiceId },
        }));
      if (invoice?.invoiceNumber) {
        invoiceLabel = ` (invoice ${invoice.invoiceNumber})`;
      }
    }

    const desc =
      voucher.remarks?.trim() ||
      `Client voucher ${voucher.voucherNumber}${invoiceLabel}`;

    if (voucher.assetAccId === partyAcc.id) {
      throw new BadRequestException(
        'Asset account cannot be the same as the client receivable account',
      );
    }

    await this.transactionsService.postEntry(
      {
        chartOfAccountId: voucher.assetAccId,
        referenceType: AccountTransactionReferenceType.CLIENT_VOUCHER_ASSET,
        referenceId: voucher.id,
        transactionDate: date,
        description: desc,
        debitAmount: amount,
        idempotent: true,
      },
      manager,
    );

    await this.transactionsService.postEntry(
      {
        chartOfAccountId: partyAcc.id,
        referenceType: AccountTransactionReferenceType.CLIENT_VOUCHER_CLIENT,
        referenceId: voucher.id,
        transactionDate: date,
        description: desc,
        creditAmount: amount,
        idempotent: true,
      },
      manager,
    );
  }

  private async clearClientLedger(voucherId: string, manager: EntityManager) {
    await this.transactionsService.deleteReferencedEntry(
      {
        referenceType: AccountTransactionReferenceType.CLIENT_VOUCHER_ASSET,
        referenceId: voucherId,
      },
      manager,
    );
    await this.transactionsService.deleteReferencedEntry(
      {
        referenceType: AccountTransactionReferenceType.CLIENT_VOUCHER_CLIENT,
        referenceId: voucherId,
      },
      manager,
    );
  }

  /** Resolve PARTY_RECEIVABLE leaf for client (by company name under 1-1-3-1). */
  private async resolveClientPartyAccount(
    clientId: string,
    manager?: EntityManager,
  ): Promise<ChartOfAccount> {
    const clientRepo = manager
      ? manager.getRepository(Client)
      : this.clientRepo;
    const client = await clientRepo.findOne({ where: { id: clientId } });
    if (!client) {
      throw new BadRequestException('Client not found');
    }

    return this.chartOfAccountsService.syncLinkedLeafName(
      COA_PARENT_CODES.CUSTOMER_RECEIVABLES,
      client.companyName,
      client.companyName,
      ChartOfAccountKind.PARTY_RECEIVABLE,
      manager,
    );
  }

  private assertStatusTransition(
    current: VoucherStatus,
    next: VoucherStatus,
  ) {
    if (current === next) {
      throw new BadRequestException(`Voucher is already ${current}`);
    }
    if (current === VoucherStatus.CANCELLED) {
      throw new BadRequestException('Cancelled vouchers cannot change status');
    }
    if (current === VoucherStatus.PAID) {
      throw new BadRequestException(
        'Paid vouchers cannot change status (ledger already posted)',
      );
    }
    if (
      next !== VoucherStatus.PAID &&
      next !== VoucherStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Pending vouchers can only move to PAID or CANCELLED',
      );
    }
  }

  private async validateClient(clientId: string) {
    const client = await this.clientRepo.findOne({ where: { id: clientId } });
    if (!client) {
      throw new BadRequestException('Client not found');
    }
    if (client.status === ClientStatus.INACTIVE) {
      throw new BadRequestException('Client is inactive');
    }
  }

  private async validateAssetAccount(assetAccId: string) {
    const assetAcc = await this.coaRepo.findOne({ where: { id: assetAccId } });
    if (!assetAcc) {
      throw new BadRequestException('Asset account not found');
    }
    if (!assetAcc.isPostable) {
      throw new BadRequestException(
        `Asset account ${assetAcc.code} is not postable`,
      );
    }
  }

  private async validateClientInvoice(
    clientId: string,
    clientInvoiceId?: string | null,
  ) {
    if (
      clientInvoiceId === undefined ||
      clientInvoiceId === null ||
      clientInvoiceId === ''
    ) {
      return;
    }

    const invoice = await this.invoiceRepo.findOne({
      where: { id: clientInvoiceId },
    });
    if (!invoice) {
      throw new BadRequestException('Client invoice not found');
    }
    if (invoice.clientId !== clientId) {
      throw new BadRequestException(
        'Client invoice does not belong to the selected client',
      );
    }
    if (invoice.invoiceStatus === ClientInvoiceStatus.CANCELLED) {
      throw new BadRequestException(
        'Cannot take payment against a cancelled invoice',
      );
    }
  }

  /**
   * When a voucher linked to an invoice is paid → invoice becomes `received`.
   * receivedDate = voucher paymentDate (first time only).
   */
  private async markLinkedInvoiceReceived(
    voucher: ClientVoucher,
    manager: EntityManager,
  ) {
    if (!voucher.clientInvoiceId) return;

    const invoiceRepo = manager.getRepository(ClientInvoice);
    const invoice = await invoiceRepo.findOne({
      where: { id: voucher.clientInvoiceId },
    });
    if (!invoice) return;
    if (invoice.invoiceStatus === ClientInvoiceStatus.CANCELLED) {
      throw new BadRequestException(
        'Cannot mark a cancelled invoice as received',
      );
    }
    if (invoice.invoiceStatus === ClientInvoiceStatus.RECEIVED) {
      return;
    }

    invoice.invoiceStatus = ClientInvoiceStatus.RECEIVED;
    invoice.receivedDate = voucher.paymentDate;
    await invoiceRepo.save(invoice);
  }

  private validateChequeFields(
    method: PaymentMethod,
    chequeNumber?: string | null,
    chequeDate?: string | Date | null,
    chequeBank?: string | null,
  ) {
    if (method !== PaymentMethod.CHEQUE) return;
    if (!chequeNumber?.toString().trim()) {
      throw new BadRequestException(
        'chequeNumber is required for CHEQUE payments',
      );
    }
    if (!chequeDate) {
      throw new BadRequestException(
        'chequeDate is required for CHEQUE payments',
      );
    }
    if (!chequeBank?.toString().trim()) {
      throw new BadRequestException(
        'chequeBank is required for CHEQUE payments',
      );
    }
  }

  private async findByIdOrFail(id: string): Promise<ClientVoucher> {
    const voucher = await this.voucherRepo.findOne({
      where: { id },
      relations: {
        client: true,
        assetAcc: true,
        clientInvoice: true,
        createdByUser: true,
      },
    });
    if (!voucher) {
      throw new NotFoundException('Client voucher not found');
    }
    return voucher;
  }

  private async findByCodeOrIdOrFail(codeOrId: string): Promise<ClientVoucher> {
    const { isUuid, key } = parseCodeOrId(codeOrId);
    if (!key) {
      throw new NotFoundException('Client voucher not found');
    }
    if (isUuid) {
      return this.findByIdOrFail(key);
    }
    const voucher = await this.voucherRepo.findOne({
      where: { voucherNumber: key.toUpperCase() },
      relations: {
        client: true,
        assetAcc: true,
        clientInvoice: true,
        createdByUser: true,
      },
    });
    if (!voucher) {
      throw new NotFoundException('Client voucher not found');
    }
    return voucher;
  }

  private async generateUniqueVoucherNumber(
    repo: Repository<ClientVoucher> = this.voucherRepo,
    skipBase: number = 0,
  ): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = await nextSerialCode(
        repo,
        CLIENT_VOUCHER_PREFIX,
        'voucherNumber',
        6,
        skipBase + attempt,
      );
      const existing = await repo.findOne({
        where: { voucherNumber: code },
      });
      if (!existing) return code;
    }
    throw new BadRequestException(
      'Could not generate unique client voucher number',
    );
  }

  private formatAmount(value: number): string {
    const n = Math.round(Number(value) * 100) / 100;
    if (!Number.isFinite(n) || n <= 0) {
      throw new BadRequestException('paymentAmount must be greater than 0');
    }
    return n.toFixed(2);
  }

  private toDateOnly(value: string | Date): Date {
    if (typeof value === 'string') {
      return value.slice(0, 10) as unknown as Date;
    }
    return value;
  }

  private nullableTrim(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private toAccountSummary(acc?: ChartOfAccount | null) {
    if (!acc) return null;
    return {
      id: acc.id,
      code: acc.code,
      name: acc.name,
      parentCode: acc.parentCode,
      isPostable: acc.isPostable,
    };
  }

  private toInvoiceSummary(invoice?: ClientInvoice | null) {
    if (!invoice) return null;
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      submissionDate: invoice.submissionDate ?? null,
      receivedDate: invoice.receivedDate ?? null,
      invoiceStatus: invoice.invoiceStatus,
      netAmount: Number(invoice.netAmount).toFixed(2),
      freightAmount: Number(invoice.freightAmount).toFixed(2),
      salesTaxAmount: Number(invoice.salesTaxAmount).toFixed(2),
    };
  }

  private async toResponse(voucher: ClientVoucher) {
    let clientAcc: ChartOfAccount | null = null;
    try {
      if (voucher.clientId) {
        clientAcc = await this.resolveClientPartyAccount(voucher.clientId);
      }
    } catch {
      clientAcc = null;
    }

    const proofImages = voucher.proofImages ?? [];
    const links = buildPublicApiLinks('client-vouchers', voucher.voucherNumber);

    return {
      id: voucher.id,
      voucherNumber: voucher.voucherNumber,
      clientId: voucher.clientId,
      clientInvoiceId: voucher.clientInvoiceId ?? null,
      assetAccId: voucher.assetAccId,
      clientAccId: clientAcc?.id ?? null,
      paymentMethod: voucher.paymentMethod,
      chequeNumber: voucher.chequeNumber,
      chequeDate: voucher.chequeDate,
      chequeBank: voucher.chequeBank,
      paymentDate: voucher.paymentDate,
      paymentAmount: Number(voucher.paymentAmount).toFixed(2),
      remarks: voucher.remarks,
      proofImages,
      proofImageUrls: proofImages.map((key) =>
        this.s3Service.getObjectUrl(key),
      ),
      publicUrl: links.publicUrl,
      qrUrl: links.qrUrl,
      publicApiUrl: links.publicApiUrl,
      createdBy: voucher.createdBy,
      status: voucher.status,
      createdAt: voucher.createdAt,
      updatedAt: voucher.updatedAt,
      client: voucher.client
        ? {
            id: voucher.client.id,
            companyName: voucher.client.companyName,
            email: voucher.client.email,
            status: voucher.client.status,
          }
        : null,
      clientInvoice: this.toInvoiceSummary(voucher.clientInvoice),
      assetAcc: this.toAccountSummary(voucher.assetAcc),
      clientAcc: this.toAccountSummary(clientAcc),
      createdByUser: voucher.createdByUser
        ? {
            id: voucher.createdByUser.id,
            name: voucher.createdByUser.name,
            email: voucher.createdByUser.email,
          }
        : null,
    };
  }

  private async deleteS3Keys(keys: string[]) {
    for (const key of keys) {
      try {
        await this.s3Service.deleteObject(key);
      } catch {
        // continue
      }
    }
  }

  private fileExtension(originalName: string, mimeType: string): string {
    const fromName = originalName.includes('.')
      ? originalName.slice(originalName.lastIndexOf('.'))
      : '';
    if (fromName && fromName.length <= 10) {
      return fromName.toLowerCase();
    }
    if (mimeType === 'image/png') return '.png';
    if (mimeType === 'image/jpeg') return '.jpg';
    return '';
  }
}
