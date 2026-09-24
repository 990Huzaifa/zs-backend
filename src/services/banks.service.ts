import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bank } from '../database/entities/bank.entity';

@Injectable()
export class BanksService {
  constructor(
    @InjectRepository(Bank)
    private readonly bankRepo: Repository<Bank>,
  ) {}

  /** Lightweight dropdown for cheque / bank pickers. */
  async listUtility(opts: { search?: string } = {}) {
    const qb = this.bankRepo
      .createQueryBuilder('bank')
      .select(['bank.id', 'bank.name', 'bank.code'])
      .orderBy('bank.name', 'ASC');

    const search = opts.search?.trim();
    if (search) {
      qb.andWhere('(bank.name ILIKE :search OR bank.code ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    const rows = await qb.getMany();
    return {
      data: rows.map((b) => ({
        id: b.id,
        label: b.name,
        name: b.name,
        code: b.code,
      })),
    };
  }
}
