import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, IsNull, Repository } from 'typeorm';
import { NotificationListQueryDto } from '../auth/dto/notification.dto';
import {
  INVOICE_CLEARING_RECIPIENT_PERMISSIONS,
  NotificationEntityType,
  NotificationModuleCode,
  NotificationType,
} from '../common/notifications/notification.constants';
import { PusherService } from '../common/pusher/pusher.service';
import {
  ClientInvoice,
  ClientInvoiceStatus,
} from '../database/entities/client-invoice.entity';
import {
  Notification,
  NotificationRecipient,
  NotificationSeverity,
} from '../database/entities/notification.entity';
import { User } from '../database/entities/user.entity';

export type CreateNotificationInput = {
  type: string;
  module: string;
  severity?: NotificationSeverity;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
  actionUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  groupKey?: string | null;
  eventKey: string;
  recipientUserIds: string[];
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationRecipient)
    private readonly recipientRepo: Repository<NotificationRecipient>,
    @InjectRepository(ClientInvoice)
    private readonly invoiceRepo: Repository<ClientInvoice>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly pusherService: PusherService,
  ) {}

  /**
   * Create a notification + fan-out recipients. Idempotent on `eventKey`.
   */
  async createNotification(
    input: CreateNotificationInput,
  ): Promise<{ notification: Notification | null; created: boolean }> {
    const existing = await this.notificationRepo.findOne({
      where: { eventKey: input.eventKey },
    });
    if (existing) {
      return { notification: existing, created: false };
    }

    const uniqueUserIds = [...new Set(input.recipientUserIds.filter(Boolean))];
    if (!uniqueUserIds.length) {
      this.logger.warn(
        `Skipping notification ${input.eventKey}: no recipients`,
      );
      return { notification: null, created: false };
    }

    const notification = await this.notificationRepo.save(
      this.notificationRepo.create({
        type: input.type,
        module: input.module,
        severity: input.severity ?? NotificationSeverity.INFO,
        title: input.title,
        message: input.message,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        actionUrl: input.actionUrl ?? null,
        metadata: input.metadata ?? null,
        groupKey: input.groupKey ?? null,
        eventKey: input.eventKey,
      }),
    );

    const recipients = await this.recipientRepo.save(
      uniqueUserIds.map((userId) =>
        this.recipientRepo.create({
          notificationId: notification.id,
          userId,
        }),
      ),
    );

    const payload = this.toNotificationPayload(notification);
    await Promise.all(
      recipients.map(async (recipient) => {
        const unreadCount = await this.countUnread(recipient.userId);
        await this.pusherService.triggerUser(
          recipient.userId,
          'notification.created',
          {
            id: recipient.id,
            readAt: recipient.readAt ?? null,
            dismissedAt: recipient.dismissedAt ?? null,
            createdAt: recipient.createdAt,
            unreadCount,
            notification: payload,
          },
        );
      }),
    );

    return { notification, created: true };
  }

  async findMyNotifications(userId: string, query: NotificationListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));

    const qb = this.recipientRepo
      .createQueryBuilder('recipient')
      .innerJoinAndSelect('recipient.notification', 'notification')
      .where('recipient.userId = :userId', { userId });

    if (!query.includeDismissed) {
      qb.andWhere('recipient.dismissedAt IS NULL');
    }
    if (query.unreadOnly) {
      qb.andWhere('recipient.readAt IS NULL');
    }
    if (query.module) {
      qb.andWhere('notification.module = :module', { module: query.module });
    }
    if (query.severity) {
      qb.andWhere('notification.severity = :severity', {
        severity: query.severity,
      });
    }
    if (query.search?.trim()) {
      qb.andWhere(
        '(notification.title ILIKE :search OR notification.message ILIKE :search)',
        { search: `%${query.search.trim()}%` },
      );
    }

    qb.orderBy('notification.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();
    const unreadCount = await this.countUnread(userId);

    return {
      unreadCount,
      data: rows.map((row) => this.toRecipientResponse(row)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getUnreadCount(userId: string) {
    return {
      unreadCount: await this.countUnread(userId),
    };
  }

  async markRead(userId: string, recipientId: string) {
    const recipient = await this.findOwnRecipientOrFail(userId, recipientId);
    if (!recipient.readAt) {
      recipient.readAt = new Date();
      await this.recipientRepo.save(recipient);
    }
    const response = this.toRecipientResponse(recipient);
    const unreadCount = await this.countUnread(userId);
    await this.pusherService.triggerUser(userId, 'notification.updated', {
      ...response,
      unreadCount,
    });
    return { ...response, unreadCount };
  }

  async markAllRead(userId: string) {
    const result = await this.recipientRepo
      .createQueryBuilder()
      .update(NotificationRecipient)
      .set({ readAt: () => 'NOW()' })
      .where('"userId" = :userId', { userId })
      .andWhere('"readAt" IS NULL')
      .andWhere('"dismissedAt" IS NULL')
      .execute();

    const unreadCount = await this.countUnread(userId);
    await this.pusherService.triggerUser(userId, 'notification.read_all', {
      updated: result.affected ?? 0,
      unreadCount,
    });

    return {
      updated: result.affected ?? 0,
      unreadCount,
    };
  }

  async dismiss(userId: string, recipientId: string) {
    const recipient = await this.findOwnRecipientOrFail(userId, recipientId);
    const now = new Date();
    if (!recipient.readAt) {
      recipient.readAt = now;
    }
    recipient.dismissedAt = now;
    await this.recipientRepo.save(recipient);
    const response = this.toRecipientResponse(recipient);
    const unreadCount = await this.countUnread(userId);
    await this.pusherService.triggerUser(userId, 'notification.updated', {
      ...response,
      unreadCount,
    });
    return { ...response, unreadCount };
  }

  /** Daily: remind for submitted invoices past client payment clearing days. */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async handleInvoiceClearingReminders() {
    this.logger.log('Running invoice clearing reminder cron...');
    try {
      const result = await this.runInvoiceClearingReminders();
      this.logger.log(
        `Invoice clearing reminders: created=${result.created}, skipped=${result.skipped}, candidates=${result.candidates}`,
      );
    } catch (err) {
      this.logger.error(
        'Invoice clearing reminder cron failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  async runInvoiceClearingReminders(today = this.todayUtcDate()) {
    const invoices = await this.invoiceRepo
      .createQueryBuilder('invoice')
      .innerJoinAndSelect('invoice.client', 'client')
      .where('invoice.invoiceStatus = :status', {
        status: ClientInvoiceStatus.SUBMITTED,
      })
      .andWhere('invoice.submissionDate IS NOT NULL')
      .andWhere('client.paymentClearingDays IS NOT NULL')
      .getMany();

    const recipients = await this.findUserIdsWithPermissions([
      ...INVOICE_CLEARING_RECIPIENT_PERMISSIONS,
    ]);

    let created = 0;
    let skipped = 0;

    for (const invoice of invoices) {
      const clearingDays = invoice.client.paymentClearingDays;
      if (clearingDays == null || clearingDays < 0) {
        skipped += 1;
        continue;
      }

      const submissionDate = this.toDateOnly(invoice.submissionDate!);
      const dueDate = this.addDays(submissionDate, clearingDays);
      if (dueDate > today) {
        skipped += 1;
        continue;
      }

      const daysOverdue = this.diffDays(dueDate, today);
      const eventKey = `invoice-clearing:${invoice.id}:${today}`;
      const groupKey = `invoice-clearing:${invoice.id}`;

      const severity =
        daysOverdue > 0
          ? NotificationSeverity.CRITICAL
          : NotificationSeverity.WARNING;

      const clientName = invoice.client.companyName;
      const title =
        daysOverdue > 0
          ? `Invoice overdue: ${invoice.invoiceNumber}`
          : `Invoice clearing due: ${invoice.invoiceNumber}`;
      const message =
        daysOverdue > 0
          ? `${clientName} invoice ${invoice.invoiceNumber} is ${daysOverdue} day(s) past clearing (${dueDate}). Net: ${invoice.netAmount}.`
          : `${clientName} invoice ${invoice.invoiceNumber} clearing is due today (${dueDate}). Net: ${invoice.netAmount}.`;

      const result = await this.createNotification({
        type: NotificationType.INVOICE_CLEARING_REMINDER,
        module: NotificationModuleCode.BILLING,
        severity,
        title,
        message,
        entityType: NotificationEntityType.CLIENT_INVOICE,
        entityId: invoice.id,
        actionUrl: `/client-invoices/${invoice.id}`,
        groupKey,
        eventKey,
        recipientUserIds: recipients,
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          clientId: invoice.clientId,
          clientName,
          netAmount: invoice.netAmount,
          submissionDate,
          paymentClearingDays: clearingDays,
          dueDate,
          daysOverdue,
        },
      });

      if (result.created) created += 1;
      else skipped += 1;
    }

    return { created, skipped, candidates: invoices.length };
  }

  private async findUserIdsWithPermissions(
    permissionCodes: string[],
  ): Promise<string[]> {
    if (!permissionCodes.length) return [];

    const users = await this.userRepo
      .createQueryBuilder('user')
      .innerJoin('user.role', 'role')
      .leftJoin('role.permissions', 'permission')
      .where('role.isActive = true')
      .andWhere(
        new Brackets((qb) => {
          qb.where('role.code = :superAdmin', {
            superAdmin: 'SUPER_ADMIN',
          }).orWhere('permission.code IN (:...codes)', {
            codes: permissionCodes,
          });
        }),
      )
      .select('user.id', 'id')
      .distinct(true)
      .getRawMany<{ id: string }>();

    return users.map((u) => u.id);
  }

  private async countUnread(userId: string) {
    return this.recipientRepo.count({
      where: {
        userId,
        readAt: IsNull(),
        dismissedAt: IsNull(),
      },
    });
  }

  private async findOwnRecipientOrFail(userId: string, recipientId: string) {
    const recipient = await this.recipientRepo.findOne({
      where: { id: recipientId, userId },
      relations: { notification: true },
    });
    if (!recipient) {
      throw new NotFoundException('Notification not found');
    }
    return recipient;
  }

  private toRecipientResponse(recipient: NotificationRecipient) {
    return {
      id: recipient.id,
      readAt: recipient.readAt ?? null,
      dismissedAt: recipient.dismissedAt ?? null,
      createdAt: recipient.createdAt,
      notification: this.toNotificationPayload(recipient.notification),
    };
  }

  private toNotificationPayload(notification: Notification) {
    return {
      id: notification.id,
      type: notification.type,
      module: notification.module,
      severity: notification.severity,
      title: notification.title,
      message: notification.message,
      entityType: notification.entityType,
      entityId: notification.entityId,
      actionUrl: notification.actionUrl,
      metadata: notification.metadata,
      groupKey: notification.groupKey,
      eventKey: notification.eventKey,
      createdAt: notification.createdAt,
    };
  }

  private todayUtcDate() {
    return new Date().toISOString().slice(0, 10);
  }

  private toDateOnly(value: Date | string) {
    if (typeof value === 'string') return value.slice(0, 10);
    return value.toISOString().slice(0, 10);
  }

  private addDays(dateOnly: string, days: number) {
    const d = new Date(`${dateOnly}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  private diffDays(fromDateOnly: string, toDateOnly: string) {
    const from = new Date(`${fromDateOnly}T00:00:00.000Z`).getTime();
    const to = new Date(`${toDateOnly}T00:00:00.000Z`).getTime();
    return Math.round((to - from) / 86_400_000);
  }
}
