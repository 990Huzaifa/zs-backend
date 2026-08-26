import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { ChartOfAccountListQueryDto } from '../auth/dto/chart-of-account.dto';
import { parseAccountCodeLevels } from '../database/chart-of-accounts/utils/parse-account-code-levels';
import {
  ChartOfAccount,
  ChartOfAccountKind,
} from '../database/entities/chart-of-account.entity';

export type CreateLinkedLeafInput = {
  parentCode: string;
  name: string;
  userId?: string | null;
  accountKind: ChartOfAccountKind;
};

export type CoaAccountType =
  | 'ASSET'
  | 'LIABILITY'
  | 'EQUITY'
  | 'REVENUE'
  | 'EXPENSE';

export type CoaListNode = {
  id: string;
  code: string;
  name: string;
  /** UI "Account" column helper: "1 Assets" */
  label: string;
  accountType: CoaAccountType | null;
  accountKind: ChartOfAccountKind;
  parentCode: string | null;
  /** UI "Parent Account" — null → show "—" */
  parentName: string | null;
  /** Ledger balance; 0 until journals exist. Parents = sum of children. */
  balance: number;
  currency: 'PKR';
  depth: number;
  hasChildren: boolean;
  isPostable: boolean;
  userId: string | null;
  user: {
    id: string;
    name: string;
    email: string | null;
    code: string;
    profileType: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
  children?: CoaListNode[];
};

@Injectable()
export class ChartOfAccountsService {
  constructor(
    @InjectRepository(ChartOfAccount)
    private readonly coaRepo: Repository<ChartOfAccount>,
  ) {}

  async findAll(query: ChartOfAccountListQueryDto) {
    const view = query.view ?? 'tree';
    const qb = this.buildListQuery(query);
    const rows = await qb.getMany();

    const nameByCode = new Map(rows.map((r) => [r.code, r.name]));
    // Parent names may be outside filtered set — load missing parent names
    const missingParents = [
      ...new Set(
        rows
          .map((r) => r.parentCode)
          .filter((c): c is string => !!c && !nameByCode.has(c)),
      ),
    ];
    if (missingParents.length) {
      const parents = await this.coaRepo
        .createQueryBuilder('coa')
        .select(['coa.code', 'coa.name'])
        .where('coa.code IN (:...codes)', { codes: missingParents })
        .getMany();
      for (const p of parents) {
        nameByCode.set(p.code, p.name);
      }
    }

    const codesWithChildren = await this.codesHavingChildren(
      rows.map((r) => r.code),
    );

    const flatNodes: CoaListNode[] = rows.map((row) => {
      const depth = row.code.split('-').length - 1;
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        label: `${row.code} ${row.name}`,
        accountType: this.resolveAccountType(row.level1),
        accountKind: row.accountKind,
        parentCode: row.parentCode ?? null,
        parentName: row.parentCode
          ? (nameByCode.get(row.parentCode) ?? null)
          : null,
        balance: 0,
        currency: 'PKR',
        depth,
        hasChildren: codesWithChildren.has(row.code),
        isPostable: row.isPostable,
        userId: row.userId ?? null,
        user: row.user
          ? {
              id: row.user.id,
              name: row.user.name,
              email: row.user.email,
              code: row.user.code,
              profileType: row.user.profileType,
            }
          : null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });

    if (view === 'flat') {
      const page = Math.max(1, query.page ?? 1);
      const limit = Math.min(200, Math.max(1, query.limit ?? 50));
      const total = flatNodes.length;
      const start = (page - 1) * limit;
      const data = flatNodes.slice(start, start + limit);
      return {
        view: 'flat' as const,
        data,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        },
      };
    }

    const tree = this.buildTree(flatNodes);
    this.rollupBalances(tree);

    return {
      view: 'tree' as const,
      data: tree,
      meta: {
        totalRoots: tree.length,
        totalAccounts: flatNodes.length,
      },
    };
  }

  /**
   * Create a postable leaf under an existing parent (e.g. driver under 2-1-1-2).
   * Pass `manager` to run inside an outer transaction.
   */
  async createLinkedLeaf(
    input: CreateLinkedLeafInput,
    manager?: EntityManager,
  ): Promise<ChartOfAccount> {
    const repo = manager
      ? manager.getRepository(ChartOfAccount)
      : this.coaRepo;

    const parent = await repo.findOne({ where: { code: input.parentCode } });
    if (!parent) {
      throw new NotFoundException(
        `Parent chart of account "${input.parentCode}" not found. Run COA seeder first.`,
      );
    }

    const nextCode = await this.nextChildCode(input.parentCode, repo);
    const levels = parseAccountCodeLevels(nextCode);

    const account = await repo.save(
      repo.create({
        code: nextCode,
        parentCode: input.parentCode,
        name: input.name.trim(),
        isPostable: true,
        accountKind: input.accountKind,
        userId: input.userId ?? null,
        ...levels,
      }),
    );

    return account;
  }

  private buildListQuery(
    query: ChartOfAccountListQueryDto,
  ): SelectQueryBuilder<ChartOfAccount> {
    const qb = this.coaRepo
      .createQueryBuilder('coa')
      .leftJoinAndSelect('coa.user', 'user')
      .orderBy('coa.code', 'ASC');

    if (query.accountKind) {
      qb.andWhere('coa.accountKind = :accountKind', {
        accountKind: query.accountKind,
      });
    }
    if (query.parentCode !== undefined) {
      qb.andWhere('coa.parentCode = :parentCode', {
        parentCode: query.parentCode,
      });
    }
    if (query.isPostable !== undefined) {
      qb.andWhere('coa.isPostable = :isPostable', {
        isPostable: query.isPostable,
      });
    }
    if (query.userId) {
      qb.andWhere('coa.userId = :userId', { userId: query.userId });
    }
    if (query.accountType) {
      const level1 = this.accountTypeToLevel1(query.accountType);
      qb.andWhere('coa.level1 = :level1', { level1 });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere('(coa.name ILIKE :search OR coa.code ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    return qb;
  }

  private async codesHavingChildren(codes: string[]): Promise<Set<string>> {
    if (!codes.length) return new Set();
    const rows = await this.coaRepo
      .createQueryBuilder('coa')
      .select('DISTINCT coa.parentCode', 'parentCode')
      .where('coa.parentCode IN (:...codes)', { codes })
      .getRawMany<{ parentCode: string }>();
    return new Set(rows.map((r) => r.parentCode));
  }

  private buildTree(nodes: CoaListNode[]): CoaListNode[] {
    const byCode = new Map<string, CoaListNode>();
    for (const node of nodes) {
      byCode.set(node.code, { ...node, children: [] });
    }

    const roots: CoaListNode[] = [];
    for (const node of byCode.values()) {
      const parentCode = node.parentCode;
      if (parentCode && byCode.has(parentCode)) {
        byCode.get(parentCode)!.children!.push(node);
        byCode.get(parentCode)!.hasChildren = true;
      } else {
        roots.push(node);
      }
    }

    const sortRecursive = (list: CoaListNode[]) => {
      list.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
      for (const n of list) {
        if (n.children?.length) sortRecursive(n.children);
        else delete n.children;
      }
    };
    sortRecursive(roots);
    return roots;
  }

  /** Parents show sum of children; leaves keep their own balance. */
  private rollupBalances(nodes: CoaListNode[]): number {
    let sum = 0;
    for (const node of nodes) {
      if (node.children?.length) {
        node.balance = this.rollupBalances(node.children);
      }
      sum += node.balance;
    }
    return sum;
  }

  private resolveAccountType(level1: number): CoaAccountType | null {
    switch (level1) {
      case 1:
        return 'ASSET';
      case 2:
        return 'LIABILITY';
      case 3:
        return 'EQUITY';
      case 4:
        return 'REVENUE';
      case 5:
        return 'EXPENSE';
      default:
        return null;
    }
  }

  private accountTypeToLevel1(type: CoaAccountType): number {
    const map: Record<CoaAccountType, number> = {
      ASSET: 1,
      LIABILITY: 2,
      EQUITY: 3,
      REVENUE: 4,
      EXPENSE: 5,
    };
    return map[type];
  }

  private async nextChildCode(
    parentCode: string,
    repo: Repository<ChartOfAccount>,
  ): Promise<string> {
    const children = await repo
      .createQueryBuilder('coa')
      .withDeleted()
      .where('coa.parentCode = :parentCode', { parentCode })
      .getMany();

    let maxSuffix = 0;
    const prefix = `${parentCode}-`;
    for (const child of children) {
      if (!child.code.startsWith(prefix)) continue;
      const suffix = child.code.slice(prefix.length);
      if (!/^\d+$/.test(suffix)) continue;
      const n = Number.parseInt(suffix, 10);
      if (n > maxSuffix) maxSuffix = n;
    }

    const next = maxSuffix + 1;
    const code = `${parentCode}-${next}`;
    if (code.split('-').length > 6) {
      throw new BadRequestException(
        `Cannot create child under "${parentCode}": max hierarchy depth (6) exceeded`,
      );
    }
    return code;
  }
}
