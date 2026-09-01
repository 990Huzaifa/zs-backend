import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateBusinessInfoSettingDto } from '../auth/dto/update-business-info-setting.dto';
import { UpdateGeoSettingDto } from '../auth/dto/update-geo-setting.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { Country } from '../database/entities/country.entity';
import {
  BusinessInfoSettingValue,
  GeoSettingValue,
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
      value: setting.value as BusinessInfoSettingValue,
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
    const current = setting.value as BusinessInfoSettingValue;

    const nextValue: BusinessInfoSettingValue = {
      logoUrl: dto.logoUrl === undefined ? current.logoUrl : dto.logoUrl,
      companyName:
        dto.companyName === undefined ? current.companyName : dto.companyName,
      tagLine: dto.tagLine === undefined ? current.tagLine : dto.tagLine,
      address: dto.address === undefined ? current.address : dto.address,
      ptcl: dto.ptcl === undefined ? current.ptcl : dto.ptcl,
      phone: dto.phone === undefined ? current.phone : dto.phone,
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
}
