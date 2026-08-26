import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateGeoSettingDto } from '../auth/dto/update-geo-setting.dto';
import { Country } from '../database/entities/country.entity';
import {
  GeoSettingValue,
  SystemSetting,
  SystemSettingKey,
} from '../database/entities/system-setting.entity';

const DEFAULT_GEO_VALUE: GeoSettingValue = {
  defaultCountryId: null,
};

@Injectable()
export class SystemSettingService {
  constructor(
    @InjectRepository(SystemSetting)
    private readonly settingRepo: Repository<SystemSetting>,
    @InjectRepository(Country)
    private readonly countryRepo: Repository<Country>,
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

  async updateGeoSetting(dto: UpdateGeoSettingDto): Promise<{
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

    return this.getGeoSetting();
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
}
