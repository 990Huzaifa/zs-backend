import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateBusinessInfoSettingDto } from '../auth/dto/update-business-info-setting.dto';
import { UpdateGeoSettingDto } from '../auth/dto/update-geo-setting.dto';
import { UpdateMaintenanceSettingDto } from '../auth/dto/update-maintenance-setting.dto';
import { UpdatePayrollSettingDto } from '../auth/dto/update-payroll-setting.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { Country } from '../database/entities/country.entity';
import {
  BusinessInfoSettingValue,
  GeoSettingValue,
  MaintenanceBatchPickingMethod,
  MaintenanceSettingValue,
  PayrollAutomationMode,
  PayrollSettingValue,
  SystemSetting,
  SystemSettingKey,
} from '../database/entities/system-setting.entity';
import { ActivitiesService } from './activities.service';

const DEFAULT_GEO_VALUE: GeoSettingValue = {
  defaultCountryId: null,
};

const DEFAULT_BUSINESS_INFO_VALUE: BusinessInfoSettingValue = {
  logoUrl: null,
  companyName: null,
  tagLine: null,
  address: null,
  ptcl: null,
  phone: null,
  whatsapp: null,
  email: null,
};

const DEFAULT_MAINTENANCE_VALUE: MaintenanceSettingValue = {
  batchPickingMethod: MaintenanceBatchPickingMethod.MANUAL,
};

const DEFAULT_PAYROLL_VALUE: PayrollSettingValue = {
  mode: PayrollAutomationMode.MANUAL,
  autoDayOfMonth: 1,
  autoTime: '02:00',
  timezone: 'Asia/Karachi',
  autoCreatePeriod: true,
  autoCalculate: true,
  autoApprove: false,
  autoMarkPaid: false,
  lastAutoPeriodKey: null,
};

@Injectable()
export class SystemSettingService {
  constructor(
    @InjectRepository(SystemSetting)
    private readonly settingRepo: Repository<SystemSetting>,
    @InjectRepository(Country)
    private readonly countryRepo: Repository<Country>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async getGeoSetting(): Promise<{
    key: SystemSettingKey.GEO;
    value: GeoSettingValue;
    defaultCountry: Country | null;
  }> {
    const setting = await this.ensureGeoSetting();
    const value = setting.value as GeoSettingValue;

    let defaultCountry: Country | null = null;
    if (value.defaultCountryId) {
      defaultCountry = await this.countryRepo.findOne({
        where: { id: value.defaultCountryId },
      });
    }

    return {
      key: SystemSettingKey.GEO,
      value,
      defaultCountry,
    };
  }

  async updateGeoSetting(
    dto: UpdateGeoSettingDto,
    activity?: ActivityActorContext,
  ): Promise<{
    key: SystemSettingKey.GEO;
    value: GeoSettingValue;
    defaultCountry: Country | null;
  }> {
    if (dto.defaultCountryId !== undefined && dto.defaultCountryId !== null) {
      const country = await this.countryRepo.findOne({
        where: { id: dto.defaultCountryId, isActive: true },
      });
      if (!country) {
        throw new NotFoundException('Country not found or inactive');
      }
    }

    const setting = await this.ensureGeoSetting();
    const current = setting.value as GeoSettingValue;

    const nextValue: GeoSettingValue = {
      defaultCountryId:
        dto.defaultCountryId === undefined
          ? current.defaultCountryId
          : dto.defaultCountryId,
    };

    setting.value = nextValue;
    await this.settingRepo.save(setting);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'SystemSetting',
        entityId: setting.id,
        record: SystemSettingKey.GEO,
        description: 'Updated GEO system setting',
        metadata: { value: nextValue },
      },
      activity,
    );

    return this.getGeoSetting();
  }

  async getBusinessInfoSetting(): Promise<{
    key: SystemSettingKey.BUSINESS_INFO;
    value: BusinessInfoSettingValue;
  }> {
    const setting = await this.ensureBusinessInfoSetting();

    return {
      key: SystemSettingKey.BUSINESS_INFO,
      value: {
        ...DEFAULT_BUSINESS_INFO_VALUE,
        ...(setting.value as BusinessInfoSettingValue),
      },
    };
  }

  async updateBusinessInfoSetting(
    dto: UpdateBusinessInfoSettingDto,
    activity?: ActivityActorContext,
  ): Promise<{
    key: SystemSettingKey.BUSINESS_INFO;
    value: BusinessInfoSettingValue;
  }> {
    const setting = await this.ensureBusinessInfoSetting();
    const current = {
      ...DEFAULT_BUSINESS_INFO_VALUE,
      ...(setting.value as BusinessInfoSettingValue),
    };

    const nextValue: BusinessInfoSettingValue = {
      logoUrl: dto.logoUrl === undefined ? current.logoUrl : dto.logoUrl,
      companyName:
        dto.companyName === undefined ? current.companyName : dto.companyName,
      tagLine: dto.tagLine === undefined ? current.tagLine : dto.tagLine,
      address: dto.address === undefined ? current.address : dto.address,
      ptcl: dto.ptcl === undefined ? current.ptcl : dto.ptcl,
      phone: dto.phone === undefined ? current.phone : dto.phone,
      whatsapp: dto.whatsapp === undefined ? current.whatsapp : dto.whatsapp,
      email: dto.email === undefined ? current.email : dto.email,
    };

    setting.value = nextValue;
    await this.settingRepo.save(setting);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'SystemSetting',
        entityId: setting.id,
        record: SystemSettingKey.BUSINESS_INFO,
        description: 'Updated business info system setting',
        metadata: { value: nextValue },
      },
      activity,
    );

    return this.getBusinessInfoSetting();
  }

  async getMaintenanceSetting(): Promise<{
    key: SystemSettingKey.MAINTENANCE;
    value: MaintenanceSettingValue;
  }> {
    const setting = await this.ensureMaintenanceSetting();

    return {
      key: SystemSettingKey.MAINTENANCE,
      value: {
        ...DEFAULT_MAINTENANCE_VALUE,
        ...(setting.value as MaintenanceSettingValue),
      },
    };
  }

  async updateMaintenanceSetting(
    dto: UpdateMaintenanceSettingDto,
    activity?: ActivityActorContext,
  ): Promise<{
    key: SystemSettingKey.MAINTENANCE;
    value: MaintenanceSettingValue;
  }> {
    const setting = await this.ensureMaintenanceSetting();
    const current = {
      ...DEFAULT_MAINTENANCE_VALUE,
      ...(setting.value as MaintenanceSettingValue),
    };

    const nextValue: MaintenanceSettingValue = {
      batchPickingMethod:
        dto.batchPickingMethod === undefined
          ? current.batchPickingMethod
          : dto.batchPickingMethod,
    };

    setting.value = nextValue;
    await this.settingRepo.save(setting);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'SystemSetting',
        entityId: setting.id,
        record: SystemSettingKey.MAINTENANCE,
        description: 'Updated maintenance system setting',
        metadata: { value: nextValue },
      },
      activity,
    );

    return this.getMaintenanceSetting();
  }

  async getPayrollSetting(): Promise<{
    key: SystemSettingKey.PAYROLL;
    value: PayrollSettingValue;
  }> {
    const setting = await this.ensurePayrollSetting();

    return {
      key: SystemSettingKey.PAYROLL,
      value: {
        ...DEFAULT_PAYROLL_VALUE,
        ...(setting.value as PayrollSettingValue),
      },
    };
  }

  async updatePayrollSetting(
    dto: UpdatePayrollSettingDto,
    activity?: ActivityActorContext,
  ): Promise<{
    key: SystemSettingKey.PAYROLL;
    value: PayrollSettingValue;
  }> {
    const setting = await this.ensurePayrollSetting();
    const current = {
      ...DEFAULT_PAYROLL_VALUE,
      ...(setting.value as PayrollSettingValue),
    };

    const nextMode = dto.mode === undefined ? current.mode : dto.mode;
    const nextDay =
      dto.autoDayOfMonth === undefined
        ? current.autoDayOfMonth
        : dto.autoDayOfMonth;
    const nextTime =
      dto.autoTime === undefined ? current.autoTime : dto.autoTime;
    const nextTimezone =
      dto.timezone === undefined ? current.timezone : dto.timezone.trim();

    this.assertValidTimezone(nextTimezone);

    if (nextMode === PayrollAutomationMode.AUTO) {
      if (nextDay < 1 || nextDay > 28) {
        throw new BadRequestException(
          'autoDayOfMonth must be between 1 and 28 when mode is AUTO',
        );
      }
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(nextTime)) {
        throw new BadRequestException('autoTime must be HH:mm (24h)');
      }
    }

    const nextValue: PayrollSettingValue = {
      mode: nextMode,
      autoDayOfMonth: nextDay,
      autoTime: nextTime,
      timezone: nextTimezone || DEFAULT_PAYROLL_VALUE.timezone,
      autoCreatePeriod:
        dto.autoCreatePeriod === undefined
          ? current.autoCreatePeriod
          : dto.autoCreatePeriod,
      autoCalculate:
        dto.autoCalculate === undefined
          ? current.autoCalculate
          : dto.autoCalculate,
      autoApprove:
        dto.autoApprove === undefined
          ? current.autoApprove
          : dto.autoApprove,
      autoMarkPaid:
        dto.autoMarkPaid === undefined
          ? current.autoMarkPaid
          : dto.autoMarkPaid,
      lastAutoPeriodKey: current.lastAutoPeriodKey ?? null,
    };

    setting.value = nextValue;
    await this.settingRepo.save(setting);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'SystemSetting',
        entityId: setting.id,
        record: SystemSettingKey.PAYROLL,
        description: 'Updated payroll system setting',
        metadata: { value: nextValue },
      },
      activity,
    );

    return this.getPayrollSetting();
  }

  /** Persist last successful auto period key (cron idempotency). */
  async markPayrollAutoPeriodDone(periodKey: string): Promise<void> {
    const setting = await this.ensurePayrollSetting();
    const current = {
      ...DEFAULT_PAYROLL_VALUE,
      ...(setting.value as PayrollSettingValue),
    };
    setting.value = {
      ...current,
      lastAutoPeriodKey: periodKey,
    };
    await this.settingRepo.save(setting);
  }

  private assertValidTimezone(timezone: string) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
      throw new BadRequestException(`Invalid timezone: ${timezone}`);
    }
  }

  private async ensureGeoSetting(): Promise<SystemSetting> {
    let setting = await this.settingRepo.findOne({
      where: { key: SystemSettingKey.GEO },
    });

    if (!setting) {
      setting = this.settingRepo.create({
        key: SystemSettingKey.GEO,
        value: { ...DEFAULT_GEO_VALUE },
      });
      setting = await this.settingRepo.save(setting);
    }

    if (!setting.value || typeof setting.value !== 'object') {
      throw new BadRequestException('Invalid GEO system setting value');
    }

    return setting;
  }

  private async ensureBusinessInfoSetting(): Promise<SystemSetting> {
    let setting = await this.settingRepo.findOne({
      where: { key: SystemSettingKey.BUSINESS_INFO },
    });

    if (!setting) {
      setting = this.settingRepo.create({
        key: SystemSettingKey.BUSINESS_INFO,
        value: { ...DEFAULT_BUSINESS_INFO_VALUE },
      });
      setting = await this.settingRepo.save(setting);
    }

    if (!setting.value || typeof setting.value !== 'object') {
      throw new BadRequestException('Invalid business info system setting value');
    }

    return setting;
  }

  private async ensureMaintenanceSetting(): Promise<SystemSetting> {
    let setting = await this.settingRepo.findOne({
      where: { key: SystemSettingKey.MAINTENANCE },
    });

    if (!setting) {
      setting = this.settingRepo.create({
        key: SystemSettingKey.MAINTENANCE,
        value: { ...DEFAULT_MAINTENANCE_VALUE },
      });
      setting = await this.settingRepo.save(setting);
    }

    if (!setting.value || typeof setting.value !== 'object') {
      throw new BadRequestException(
        'Invalid maintenance system setting value',
      );
    }

    return setting;
  }

  private async ensurePayrollSetting(): Promise<SystemSetting> {
    let setting = await this.settingRepo.findOne({
      where: { key: SystemSettingKey.PAYROLL },
    });

    if (!setting) {
      setting = this.settingRepo.create({
        key: SystemSettingKey.PAYROLL,
        value: { ...DEFAULT_PAYROLL_VALUE },
      });
      setting = await this.settingRepo.save(setting);
    }

    if (!setting.value || typeof setting.value !== 'object') {
      throw new BadRequestException('Invalid payroll system setting value');
    }

    return setting;
  }
}
