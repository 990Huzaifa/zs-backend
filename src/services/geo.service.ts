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
}