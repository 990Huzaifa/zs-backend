import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, In, Repository } from 'typeorm';
import {
  CreateRoleDto,
  RoleListQueryDto,
  UpdateRoleDto,
} from '../auth/dto/role.dto';
import { Permission } from '../database/entities/permission.entity';
import { Role } from '../database/entities/role.entity';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
  ) {}

  async create(dto: CreateRoleDto): Promise<Role> {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.roleRepo.findOne({ where: { code } });
    if (existing) {
      throw new ConflictException('Role code already exists');
    }

    const permissions = await this.resolvePermissions(dto.permissionIds);
    const role = this.roleRepo.create({
      code,
      name: dto.name.trim(),
      isActive: dto.isActive ?? true,
      permissions,
    });

    const saved = await this.roleRepo.save(role);
    return this.findByIdOrFail(saved.id);
  }

  async findAll(query: RoleListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<Role> = {};
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    const search = query.search?.trim();
    const whereClause: FindOptionsWhere<Role>[] | FindOptionsWhere<Role> =
      search
        ? [
            { ...where, name: ILike(`%${search}%`) },
            { ...where, code: ILike(`%${search}%`) },
          ]
        : where;

    const [data, total] = await this.roleRepo.findAndCount({
      where: whereClause,
      relations: { permissions: true },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

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

  async findOne(id: string): Promise<Role> {
    return this.findByIdOrFail(id);
  }

  async update(id: string, dto: UpdateRoleDto): Promise<Role> {
    const role = await this.findByIdOrFail(id);

    if (role.code === 'SUPER_ADMIN' && dto.isActive === false) {
      throw new BadRequestException('SUPER_ADMIN role cannot be deactivated');
    }

    if (dto.name !== undefined) {
      role.name = dto.name.trim();
    }
    if (dto.isActive !== undefined) {
      role.isActive = dto.isActive;
    }
    if (dto.permissionIds !== undefined) {
      role.permissions = await this.resolvePermissions(
        dto.permissionIds,
        true,
      );
    }

    await this.roleRepo.save(role);
    return this.findByIdOrFail(id);
  }

  async listPermissions(): Promise<Permission[]> {
    return this.permissionRepo.find({
      where: { isActive: true },
      order: { code: 'ASC' },
    });
  }

  private async findByIdOrFail(id: string): Promise<Role> {
    const role = await this.roleRepo.findOne({
      where: { id },
      relations: { permissions: true },
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    return role;
  }

  private async resolvePermissions(
    permissionIds: number[],
    allowEmpty = false,
  ): Promise<Permission[]> {
    const uniqueIds = [...new Set(permissionIds)];
    if (uniqueIds.length === 0) {
      if (allowEmpty) {
        return [];
      }
      throw new BadRequestException('At least one permission is required');
    }

    const permissions = await this.permissionRepo.find({
      where: { id: In(uniqueIds), isActive: true },
    });

    if (permissions.length !== uniqueIds.length) {
      throw new BadRequestException('One or more permission ids are invalid');
    }

    return permissions;
  }
}
