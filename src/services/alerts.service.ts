import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import {
  AlertListQueryDto,
  DismissAlertDto,
  ResolveAlertDto,
} from '../auth/dto/alert.dto';
import {
  DOCUMENT_EXPIRY_ALERT_RECIPIENT_PERMISSIONS,
  NotificationEntityType,
  NotificationModuleCode,
  NotificationType,
} from '../common/notifications/notification.constants';
import {
  Alert,
  AlertEntityType,
  AlertModule,
  AlertStatus,
  AlertType,
} from '../database/entities/alert.entity';
import { BrokerDocument } from '../database/entities/broker.entity';
import { ClientDocument } from '../database/entities/client.entity';
import { Driver, DriverDocument } from '../database/entities/driver.entity';
import { NotificationSeverity } from '../database/entities/notification.entity';
import { AlertsSettingValue } from '../database/entities/system-setting.entity';
import { TransporterDocument } from '../database/entities/transporter.entity';
import { User } from '../database/entities/user.entity';
import { VehicleDocument } from '../database/entities/vehicle.entity';
import { NotificationsService } from './notifications.service';
import { SystemSettingService } from './system-setting.service';

type DocExpiryCandidate = {
  sourceKey: string;
  type: AlertType;
  module: AlertModule;
  entityType: AlertEntityType;
  entityId: string;
  dueAt: string;
  title: string;
  message: string;
  actionUrl: string;
  metadata: Record<string, unknown>;
};

const SEVERITY_RANK: Record<NotificationSeverity, number> = {
  [NotificationSeverity.INFO]: 0,
  [NotificationSeverity.SUCCESS]: 1,
  [NotificationSeverity.WARNING]: 2,
  [NotificationSeverity.CRITICAL]: 3,
};

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    @InjectRepository(Alert)
    private readonly alertRepo: Repository<Alert>,
    @InjectRepository(DriverDocument)
    private readonly driverDocRepo: Repository<DriverDocument>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(VehicleDocument)
    private readonly vehicleDocRepo: Repository<VehicleDocument>,
    @InjectRepository(ClientDocument)
    private readonly clientDocRepo: Repository<ClientDocument>,
    @InjectRepository(TransporterDocument)
    private readonly transporterDocRepo: Repository<TransporterDocument>,
    @InjectRepository(BrokerDocument)
    private readonly brokerDocRepo: Repository<BrokerDocument>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly systemSettingService: SystemSettingService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Daily at 01:15 — offset from invoice clearing cron at 01:00. */
  @Cron('15 1 * * *')
  async handleDocumentExpiryAlerts() {
    this.logger.log('Running document expiry alerts cron...');
    try {
      const result = await this.runDocumentExpiryScan();
      this.logger.log(
        `Document expiry alerts: created=${result.created}, updated=${result.updated}, resolved=${result.resolved}, notified=${result.notified}, candidates=${result.candidates}`,
      );
    } catch (err) {
      this.logger.error(
        'Document expiry alerts cron failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  async runDocumentExpiryScan(today = this.todayUtcDate()) {
    const { value: settings } =
      await this.systemSettingService.getAlertsSetting();
    const candidates = await this.collectDocumentExpiryCandidates(
      settings,
      today,
    );
    const activeKeys = new Set(candidates.map((c) => c.sourceKey));

    const recipients = await this.findUserIdsWithPermissions([
      ...DOCUMENT_EXPIRY_ALERT_RECIPIENT_PERMISSIONS,
    ]);

    let created = 0;
    let updated = 0;
    let notified = 0;

    for (const candidate of candidates) {
      const result = await this.upsertDocumentExpiryAlert(
        candidate,
        settings,
        today,
        recipients,
      );
      if (result.created) created += 1;
      if (result.updated) updated += 1;
      if (result.notified) notified += 1;
    }

    const resolved = await this.autoResolveStaleDocumentAlerts(activeKeys);

    return {
      created,
      updated,
      resolved,
      notified,
      candidates: candidates.length,
    };
  }

  async findAll(query: AlertListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));

    const qb = this.alertRepo.createQueryBuilder('alert');

    if (query.status) {
      qb.andWhere('alert.status = :status', { status: query.status });
    }
    if (query.type) {
      qb.andWhere('alert.type = :type', { type: query.type });
    }
    if (query.module) {
      qb.andWhere('alert.module = :module', { module: query.module });
    }
    if (query.severity) {
      qb.andWhere('alert.severity = :severity', { severity: query.severity });
    }
    if (query.search?.trim()) {
      qb.andWhere(
        '(alert.title ILIKE :search OR alert.message ILIKE :search)',
        { search: `%${query.search.trim()}%` },
      );
    }

    qb.orderBy('alert.dueAt', 'ASC')
      .addOrderBy('alert.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

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
    const alert = await this.alertRepo.findOne({
      where: { id },
      relations: { resolvedBy: true },
    });
    if (!alert) {
      throw new NotFoundException('Alert not found');
    }
    return alert;
  }

  async acknowledge(id: string, userId: string) {
    const alert = await this.findOpenishOrFail(id);
    if (alert.status === AlertStatus.ACKNOWLEDGED) {
      return alert;
    }
    alert.status = AlertStatus.ACKNOWLEDGED;
    return this.alertRepo.save(alert);
  }

  async resolve(id: string, userId: string, dto: ResolveAlertDto = {}) {
    const alert = await this.findOpenishOrFail(id);
    alert.status = AlertStatus.RESOLVED;
    alert.resolvedAt = new Date();
    alert.resolvedById = userId;
    alert.resolutionNote = dto.resolutionNote?.trim() || null;
    return this.alertRepo.save(alert);
  }

  async dismiss(id: string, userId: string, dto: DismissAlertDto = {}) {
    const alert = await this.findOpenishOrFail(id);
    alert.status = AlertStatus.DISMISSED;
    alert.resolvedAt = new Date();
    alert.resolvedById = userId;
    alert.resolutionNote = dto.resolutionNote?.trim() || null;
    return this.alertRepo.save(alert);
  }

  private async findOpenishOrFail(id: string) {
    const alert = await this.alertRepo.findOne({ where: { id } });
    if (!alert) {
      throw new NotFoundException('Alert not found');
    }
    if (
      alert.status === AlertStatus.RESOLVED ||
      alert.status === AlertStatus.DISMISSED
    ) {
      throw new BadRequestException(
        `Alert is already ${alert.status} and cannot be updated`,
      );
    }
    return alert;
  }

  private async upsertDocumentExpiryAlert(
    candidate: DocExpiryCandidate,
    settings: AlertsSettingValue,
    today: string,
    recipientUserIds: string[],
  ): Promise<{ created: boolean; updated: boolean; notified: boolean }> {
    const daysLeft = this.diffDays(today, candidate.dueAt);
    const severity = this.severityForDaysLeft(daysLeft, settings);
    const windowStartsAt = this.addDays(
      candidate.dueAt,
      -settings.warningDaysBefore,
    );

    const metadata = {
      ...candidate.metadata,
      daysLeft,
      warningDaysBefore: settings.warningDaysBefore,
      criticalDaysBefore: settings.criticalDaysBefore,
      actionUrl: candidate.actionUrl,
    };

    let alert = await this.alertRepo.findOne({
      where: { sourceKey: candidate.sourceKey },
    });

    let created = false;
    let updated = false;
    let previousSeverity: NotificationSeverity | null = null;

    if (!alert) {
      alert = await this.alertRepo.save(
        this.alertRepo.create({
          type: candidate.type,
          module: candidate.module,
          severity,
          status: AlertStatus.OPEN,
          title: candidate.title,
          message: candidate.message,
          entityType: candidate.entityType,
          entityId: candidate.entityId,
          dueAt: candidate.dueAt,
          windowStartsAt,
          sourceKey: candidate.sourceKey,
          metadata,
          resolvedAt: null,
          resolvedById: null,
          resolutionNote: null,
        }),
      );
      created = true;
    } else if (
      alert.status === AlertStatus.RESOLVED ||
      alert.status === AlertStatus.DISMISSED
    ) {
      // Manual close stays closed while still in window.
      return { created: false, updated: false, notified: false };
    } else {
      previousSeverity = alert.severity;

      alert.severity = severity;
      alert.title = candidate.title;
      alert.message = candidate.message;
      alert.dueAt = candidate.dueAt;
      alert.windowStartsAt = windowStartsAt;
      alert.metadata = metadata;
      alert.entityType = candidate.entityType;
      alert.entityId = candidate.entityId;
      alert.module = candidate.module;

      alert = await this.alertRepo.save(alert);
      updated = true;
    }

    const shouldNotify =
      created ||
      (previousSeverity != null &&
        SEVERITY_RANK[severity] > SEVERITY_RANK[previousSeverity]);

    let notified = false;
    if (shouldNotify) {
      notified = await this.notifyDocumentExpiry(
        alert,
        candidate,
        today,
        recipientUserIds,
      );
    }

    return { created, updated, notified };
  }

  private async notifyDocumentExpiry(
    alert: Alert,
    candidate: DocExpiryCandidate,
    today: string,
    recipientUserIds: string[],
  ): Promise<boolean> {
    const result = await this.notificationsService.createNotification({
      type: NotificationType.DOCUMENT_EXPIRY_ALERT,
      module: this.toNotificationModule(candidate.module),
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      entityType: NotificationEntityType.ALERT,
      entityId: alert.id,
      actionUrl: candidate.actionUrl,
      groupKey: `doc-expiry:${candidate.sourceKey}`,
      eventKey: `alert:${alert.id}:${today}:${alert.severity}`,
      recipientUserIds,
      metadata: {
        alertId: alert.id,
        sourceKey: candidate.sourceKey,
        ...(alert.metadata ?? {}),
      },
    });
    return result.created;
  }

  private async autoResolveStaleDocumentAlerts(
    activeKeys: Set<string>,
  ): Promise<number> {
    const openAlerts = await this.alertRepo.find({
      where: {
        type: AlertType.DOCUMENT_EXPIRY,
        status: In([AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED]),
      },
    });

    let resolved = 0;
    for (const alert of openAlerts) {
      if (activeKeys.has(alert.sourceKey)) continue;
      alert.status = AlertStatus.RESOLVED;
      alert.resolvedAt = new Date();
      alert.resolvedById = null;
      alert.resolutionNote =
        'Auto-resolved: document renewed or removed from expiry window';
      await this.alertRepo.save(alert);
      resolved += 1;
    }
    return resolved;
  }

  private async collectDocumentExpiryCandidates(
    settings: AlertsSettingValue,
    today: string,
  ): Promise<DocExpiryCandidate[]> {
    const windowEnd = this.addDays(today, settings.warningDaysBefore);
    const candidates: DocExpiryCandidate[] = [];

    const driverDocs = await this.driverDocRepo
      .createQueryBuilder('doc')
      .innerJoinAndSelect('doc.driver', 'driver')
      .leftJoinAndSelect('driver.user', 'user')
      .where('doc.validity IS NOT NULL')
      .andWhere('doc.validity <= :windowEnd', { windowEnd })
      .getMany();

    for (const doc of driverDocs) {
      const dueAt = this.toDateOnly(doc.validity!);
      const driverName = doc.driver?.user?.name ?? 'Driver';
      const docLabel = doc.name || doc.docType;
      candidates.push({
        sourceKey: `doc-expiry:driver_document:${doc.id}`,
        type: AlertType.DOCUMENT_EXPIRY,
        module: AlertModule.DRIVER,
        entityType: AlertEntityType.DRIVER_DOCUMENT,
        entityId: doc.id,
        dueAt,
        title: `Driver document expiring: ${docLabel}`,
        message: this.buildExpiryMessage(
          `${driverName} — ${docLabel}`,
          dueAt,
          today,
        ),
        actionUrl: `/drivers/${doc.driverId}`,
        metadata: {
          driverId: doc.driverId,
          driverName,
          documentId: doc.id,
          documentName: doc.name ?? null,
          docType: doc.docType,
        },
      });
    }

    const driversWithLicense = await this.driverRepo
      .createQueryBuilder('driver')
      .leftJoinAndSelect('driver.user', 'user')
      .where('driver.licenseValidity IS NOT NULL')
      .andWhere('driver.licenseValidity <= :windowEnd', { windowEnd })
      .getMany();

    for (const driver of driversWithLicense) {
      const dueAt = this.toDateOnly(driver.licenseValidity!);
      const driverName = driver.user?.name ?? 'Driver';
      candidates.push({
        sourceKey: `doc-expiry:driver_license:${driver.id}`,
        type: AlertType.DOCUMENT_EXPIRY,
        module: AlertModule.DRIVER,
        entityType: AlertEntityType.DRIVER,
        entityId: driver.id,
        dueAt,
        title: `Driver license expiring: ${driverName}`,
        message: this.buildExpiryMessage(
          `${driverName} license`,
          dueAt,
          today,
        ),
        actionUrl: `/drivers/${driver.id}`,
        metadata: {
          driverId: driver.id,
          driverName,
          licenseNo: driver.licenseNo ?? null,
          field: 'licenseValidity',
        },
      });
    }

    const vehicleDocs = await this.vehicleDocRepo
      .createQueryBuilder('doc')
      .innerJoinAndSelect('doc.vehicle', 'vehicle')
      .where('doc.validity IS NOT NULL')
      .andWhere('doc.validity <= :windowEnd', { windowEnd })
      .getMany();

    for (const doc of vehicleDocs) {
      const dueAt = this.toDateOnly(doc.validity!);
      const regNo = doc.vehicle?.regNo ?? 'Vehicle';
      const docLabel = doc.name || doc.docType;
      candidates.push({
        sourceKey: `doc-expiry:vehicle_document:${doc.id}`,
        type: AlertType.DOCUMENT_EXPIRY,
        module: AlertModule.VEHICLE,
        entityType: AlertEntityType.VEHICLE_DOCUMENT,
        entityId: doc.id,
        dueAt,
        title: `Vehicle document expiring: ${docLabel}`,
        message: this.buildExpiryMessage(
          `${regNo} — ${docLabel}`,
          dueAt,
          today,
        ),
        actionUrl: `/vehicles/${doc.vehicleId}`,
        metadata: {
          vehicleId: doc.vehicleId,
          regNo,
          documentId: doc.id,
          documentName: doc.name ?? null,
          docType: doc.docType,
        },
      });
    }

    const clientDocs = await this.clientDocRepo
      .createQueryBuilder('doc')
      .innerJoinAndSelect('doc.client', 'client')
      .where('doc.validity IS NOT NULL')
      .andWhere('doc.validity <= :windowEnd', { windowEnd })
      .getMany();

    for (const doc of clientDocs) {
      const dueAt = this.toDateOnly(doc.validity!);
      const clientName = doc.client?.companyName ?? 'Client';
      const docLabel = doc.name || doc.docType || 'Document';
      candidates.push({
        sourceKey: `doc-expiry:client_document:${doc.id}`,
        type: AlertType.DOCUMENT_EXPIRY,
        module: AlertModule.CLIENT,
        entityType: AlertEntityType.CLIENT_DOCUMENT,
        entityId: doc.id,
        dueAt,
        title: `Client document expiring: ${docLabel}`,
        message: this.buildExpiryMessage(
          `${clientName} — ${docLabel}`,
          dueAt,
          today,
        ),
        actionUrl: `/clients/${doc.clientId}`,
        metadata: {
          clientId: doc.clientId,
          clientName,
          documentId: doc.id,
          documentName: doc.name ?? null,
          docType: doc.docType ?? null,
        },
      });
    }

    const transporterDocs = await this.transporterDocRepo
      .createQueryBuilder('doc')
      .innerJoinAndSelect('doc.transporter', 'transporter')
      .where('doc.validity IS NOT NULL')
      .andWhere('doc.validity <= :windowEnd', { windowEnd })
      .getMany();

    for (const doc of transporterDocs) {
      const dueAt = this.toDateOnly(doc.validity!);
      const companyName = doc.transporter?.companyName ?? 'Transporter';
      const docLabel = doc.name || 'Document';
      candidates.push({
        sourceKey: `doc-expiry:transporter_document:${doc.id}`,
        type: AlertType.DOCUMENT_EXPIRY,
        module: AlertModule.TRANSPORTER,
        entityType: AlertEntityType.TRANSPORTER_DOCUMENT,
        entityId: doc.id,
        dueAt,
        title: `Transporter document expiring: ${docLabel}`,
        message: this.buildExpiryMessage(
          `${companyName} — ${docLabel}`,
          dueAt,
          today,
        ),
        actionUrl: `/transporters/${doc.transporterId}`,
        metadata: {
          transporterId: doc.transporterId,
          companyName,
          documentId: doc.id,
          documentName: doc.name ?? null,
        },
      });
    }

    const brokerDocs = await this.brokerDocRepo
      .createQueryBuilder('doc')
      .innerJoinAndSelect('doc.broker', 'broker')
      .where('doc.validity IS NOT NULL')
      .andWhere('doc.validity <= :windowEnd', { windowEnd })
      .getMany();

    for (const doc of brokerDocs) {
      const dueAt = this.toDateOnly(doc.validity!);
      const companyName = doc.broker?.companyName ?? 'Broker';
      const docLabel = doc.name || 'Document';
      candidates.push({
        sourceKey: `doc-expiry:broker_document:${doc.id}`,
        type: AlertType.DOCUMENT_EXPIRY,
        module: AlertModule.BROKER,
        entityType: AlertEntityType.BROKER_DOCUMENT,
        entityId: doc.id,
        dueAt,
        title: `Broker document expiring: ${docLabel}`,
        message: this.buildExpiryMessage(
          `${companyName} — ${docLabel}`,
          dueAt,
          today,
        ),
        actionUrl: `/brokers/${doc.brokerId}`,
        metadata: {
          brokerId: doc.brokerId,
          companyName,
          documentId: doc.id,
          documentName: doc.name ?? null,
        },
      });
    }

    return candidates;
  }

  private buildExpiryMessage(subject: string, dueAt: string, today: string) {
    const daysLeft = this.diffDays(today, dueAt);
    if (daysLeft < 0) {
      return `${subject} expired ${Math.abs(daysLeft)} day(s) ago (${dueAt}).`;
    }
    if (daysLeft === 0) {
      return `${subject} expires today (${dueAt}).`;
    }
    return `${subject} expires in ${daysLeft} day(s) (${dueAt}).`;
  }

  private severityForDaysLeft(
    daysLeft: number,
    settings: AlertsSettingValue,
  ): NotificationSeverity {
    if (daysLeft <= settings.criticalDaysBefore) {
      return NotificationSeverity.CRITICAL;
    }
    return NotificationSeverity.WARNING;
  }

  private toNotificationModule(module: AlertModule): string {
    switch (module) {
      case AlertModule.DRIVER:
        return NotificationModuleCode.DRIVER;
      case AlertModule.VEHICLE:
        return NotificationModuleCode.VEHICLE;
      case AlertModule.CLIENT:
        return NotificationModuleCode.CLIENT;
      case AlertModule.TRANSPORTER:
        return NotificationModuleCode.TRANSPORTER;
      case AlertModule.BROKER:
        return NotificationModuleCode.BROKER;
      default:
        return NotificationModuleCode.SYSTEM;
    }
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
