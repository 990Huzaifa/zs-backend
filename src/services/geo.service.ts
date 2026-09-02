import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { City } from '../database/entities/city.entity';
import { Country } from '../database/entities/country.entity';
import { State } from '../database/entities/state.entity';
@Injectable()
export class GeoService {
    constructor(
        @InjectRepository(Country)
        private readonly countryRepo: Repository<Country>,
        @InjectRepository(State)
        private readonly stateRepo: Repository<State>,
        @InjectRepository(City)
        private readonly cityRepo: Repository<City>,
    ) { }
    async listCountries(activeOnly = true): Promise<Country[]> {
        return this.countryRepo.find({
            where: activeOnly ? { isActive: true } : {},
            order: { name: 'ASC' },
        });
    }
    async getCountry(id: string): Promise<Country> {
        const country = await this.countryRepo.findOne({ where: { id } });
        if (!country) {
            throw new NotFoundException('Country not found');
        }
        return country;
    }

    async listStatesByCountry(
        countryId: string,
        activeOnly = true,
    ): Promise<State[]> {
        await this.getCountry(countryId);
        return this.stateRepo.find({
            where: activeOnly
                ? { countryId, isActive: true }
                : { countryId },
            order: { name: 'ASC' },
        });
    }
    async listCitiesByState(
        stateId: string,
        activeOnly = true,
    ): Promise<City[]> {
        const state = await this.stateRepo.findOne({ where: { id: stateId } });
        if (!state) {
            throw new NotFoundException('State not found');
        }
        return this.cityRepo.find({
            where: activeOnly ? { stateId, isActive: true } : { stateId },
            order: { name: 'ASC' },
        });
    }

    /** Utility — single city by id with state + country for form prefill. */
    async getCityUtility(cityId: string | number) {
        const city = await this.cityRepo.findOne({
            where: { id: String(cityId) },
            relations: { state: { country: true } },
        });
        if (!city) {
            throw new NotFoundException('City not found');
        }

        const state = city.state;
        const country = state?.country;

        return {
            id: city.id,
            name: city.name,
            code: city.code,
            stateId: city.stateId,
            isActive: city.isActive,
            state: state
                ? {
                      id: state.id,
                      name: state.name,
                      code: state.code,
                      countryId: state.countryId,
                      isActive: state.isActive,
                  }
                : null,
            country: country
                ? {
                      id: country.id,
                      name: country.name,
                      code: country.isoCode,
                      isActive: country.isActive,
                  }
                : null,
        };
    }

    /** Utility — single state by id with country for form prefill. */
    async getStateUtility(stateId: string | number) {
        const state = await this.stateRepo.findOne({
            where: { id: String(stateId) },
            relations: { country: true },
        });
        if (!state) {
            throw new NotFoundException('State not found');
        }

        const country = state.country;

        return {
            id: state.id,
            name: state.name,
            code: state.code,
            countryId: state.countryId,
            isActive: state.isActive,
            country: country
                ? {
                      id: country.id,
                      name: country.name,
                      code: country.isoCode,
                      isActive: country.isActive,
                  }
                : null,
        };
    }
}