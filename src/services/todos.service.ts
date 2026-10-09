import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  CreateTodoDto,
  QuickCreateTodoDto,
  ReorderTodosDto,
  TODO_COLOR_PRESETS,
  TodoListQueryDto,
  UpdateTodoDto,
} from '../auth/dto/todo.dto';
import { PusherService } from '../common/pusher/pusher.service';
import { Todo, TodoStatus } from '../database/entities/todo.entity';

const SOFTBOARD_LIMIT = 12;
const DEFAULT_COLOR = TODO_COLOR_PRESETS[0];
const DEFAULT_QUICK_TITLE = 'New note';

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

@Injectable()
export class TodosService {
  constructor(
    @InjectRepository(Todo)
    private readonly todoRepo: Repository<Todo>,
    private readonly pusherService: PusherService,
  ) {}

  async create(userId: string, dto: CreateTodoDto) {
    const title = dto.title.trim();
    if (!title) {
      throw new BadRequestException('Title is required');
    }

    const saved = await this.todoRepo.save(
      this.todoRepo.create({
        userId,
        title,
        body: dto.body?.trim() || null,
        status: dto.status ?? TodoStatus.PENDING,
        color: dto.color?.trim() || DEFAULT_COLOR,
        sortOrder: dto.sortOrder ?? 0,
        pinned: dto.pinned ?? false,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      }),
    );

    const payload = this.toResponse(saved);
    await this.pusherService.triggerUser(userId, 'todo.created', payload);
    return payload;
  }

  /**
   * FAB / "+ Add Todo" — instantly create a sticky with UI defaults
   * so the panel can open it for editing and softboard live-updates.
   */
  async quickCreate(userId: string, dto: QuickCreateTodoDto = {}) {
    const title = dto.title?.trim() || DEFAULT_QUICK_TITLE;
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : this.startOfToday();

    const saved = await this.todoRepo.save(
      this.todoRepo.create({
        userId,
        title,
        body: dto.body?.trim() || null,
        status: TodoStatus.PENDING,
        color: dto.color?.trim() || DEFAULT_COLOR,
        sortOrder: 0,
        pinned: dto.pinned ?? false,
        dueAt,
      }),
    );

    const payload = this.toResponse(saved);
    await this.pusherService.triggerUser(userId, 'todo.created', payload);
    return payload;
  }

  async findAll(userId: string, query: TodoListQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.todoRepo
      .createQueryBuilder('todo')
      .where('todo.userId = :userId', { userId })
      .orderBy('todo.pinned', 'DESC')
      .addOrderBy('todo.sortOrder', 'ASC')
      .addOrderBy('todo.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.status) {
      qb.andWhere('todo.status = :status', { status: query.status });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere('(todo.title ILIKE :search OR todo.body ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    const [rows, total] = await qb.getManyAndCount();

    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(userId: string, id: string) {
    return this.toResponse(await this.findOwnedOrFail(userId, id));
  }

  async update(userId: string, id: string, dto: UpdateTodoDto) {
    const todo = await this.findOwnedOrFail(userId, id);

    if (dto.title !== undefined) {
      const title = dto.title.trim();
      if (!title) {
        throw new BadRequestException('Title is required');
      }
      todo.title = title;
    }
    if (dto.body !== undefined) {
      todo.body = dto.body?.trim() || null;
    }
    if (dto.completed !== undefined) {
      todo.status = dto.completed ? TodoStatus.DONE : TodoStatus.PENDING;
    } else if (dto.status !== undefined) {
      todo.status = dto.status;
    }
    if (dto.color !== undefined) {
      todo.color = dto.color.trim() || DEFAULT_COLOR;
    }
    if (dto.sortOrder !== undefined) {
      todo.sortOrder = dto.sortOrder;
    }
    if (dto.pinned !== undefined) {
      todo.pinned = dto.pinned;
    }
    if (dto.dueAt !== undefined) {
      todo.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    }

    const saved = await this.todoRepo.save(todo);
    const payload = this.toResponse(saved);
    await this.pusherService.triggerUser(userId, 'todo.updated', payload);
    return payload;
  }

  async remove(userId: string, id: string) {
    const todo = await this.findOwnedOrFail(userId, id);
    await this.todoRepo.remove(todo);
    await this.pusherService.triggerUser(userId, 'todo.deleted', { id });
    return { id };
  }

  async reorder(userId: string, dto: ReorderTodosDto) {
    const ids = dto.items.map((item) => item.id);
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length !== ids.length) {
      throw new BadRequestException('Duplicate todo ids in reorder payload');
    }

    const owned = await this.todoRepo.find({
      where: { userId, id: In(uniqueIds) },
      select: ['id'],
    });
    if (owned.length !== uniqueIds.length) {
      throw new NotFoundException('One or more todos not found');
    }

    await this.todoRepo.manager.transaction(async (manager) => {
      for (const item of dto.items) {
        await manager.update(
          Todo,
          { id: item.id, userId },
          { sortOrder: item.sortOrder },
        );
      }
    });

    const payload = { items: dto.items };
    await this.pusherService.triggerUser(userId, 'todo.reordered', payload);
    return payload;
  }

  /**
   * Dashboard "My Personal Todos" softboard card — matches UI strip:
   * Active / Pending / In Progress / Done counts + sticky note cards.
   */
  async getSoftboard(userId: string) {
    const today = this.todayDateString();

    const [rows, pending, inProgress, done] = await Promise.all([
      this.todoRepo
        .createQueryBuilder('todo')
        .where('todo.userId = :userId', { userId })
        .orderBy('todo.pinned', 'DESC')
        .addOrderBy(
          `CASE WHEN todo.status = '${TodoStatus.DONE}' THEN 1 ELSE 0 END`,
          'ASC',
        )
        .addOrderBy('todo.sortOrder', 'ASC')
        .addOrderBy('todo.createdAt', 'DESC')
        .take(SOFTBOARD_LIMIT)
        .getMany(),
      this.todoRepo.count({
        where: { userId, status: TodoStatus.PENDING },
      }),
      this.todoRepo.count({
        where: { userId, status: TodoStatus.IN_PROGRESS },
      }),
      this.todoRepo.count({
        where: { userId, status: TodoStatus.DONE },
      }),
    ]);

    const active = pending + inProgress;

    return {
      key: 'personal_todos',
      title: 'My Personal Todos',
      iconType: 'todo',
      colorTheme: 'green',
      counts: {
        active,
        pending,
        in_progress: inProgress,
        done,
      },
      breakdown: [
        { key: 'active', label: 'Active', count: active, color: '#22C55E' },
        { key: 'pending', label: 'Pending', count: pending, color: '#F59E0B' },
        {
          key: 'in_progress',
          label: 'In Progress',
          count: inProgress,
          color: '#3B82F6',
        },
        { key: 'done', label: 'Done', count: done, color: '#16A34A' },
      ],
      softboard: rows.map((row) => this.toSoftboardCard(row, today)),
      colorPresets: [...TODO_COLOR_PRESETS],
    };
  }

  private async findOwnedOrFail(userId: string, id: string) {
    const todo = await this.todoRepo.findOne({ where: { id, userId } });
    if (!todo) {
      throw new NotFoundException('Todo not found');
    }
    return todo;
  }

  private toSoftboardCard(todo: Todo, today: string) {
    const base = this.toResponse(todo);
    const dueDate = todo.dueAt ? this.normalizeDateValue(todo.dueAt) : null;
    const isDueToday = dueDate === today;
    const isOverdue = !!dueDate && dueDate < today && !base.completed;

    return {
      ...base,
      description: todo.body,
      dueLabel: this.formatDueLabel(todo.dueAt, today),
      isDueToday,
      isOverdue,
    };
  }

  private toResponse(todo: Todo) {
    const completed = todo.status === TodoStatus.DONE;
    return {
      id: todo.id,
      userId: todo.userId,
      title: todo.title,
      body: todo.body,
      description: todo.body,
      status: todo.status,
      completed,
      color: todo.color,
      sortOrder: todo.sortOrder,
      pinned: todo.pinned,
      dueAt: todo.dueAt,
      createdAt: todo.createdAt,
      updatedAt: todo.updatedAt,
    };
  }

  private formatDueLabel(dueAt: Date | null, today: string): string | null {
    if (!dueAt) return null;
    const date = this.normalizeDateValue(dueAt);
    if (date === today) {
      const d = new Date(`${date}T00:00:00`);
      return `Today, ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
    }
    const d = new Date(`${date}T00:00:00`);
    return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  private normalizeDateValue(value: Date | string): string {
    if (typeof value === 'string') {
      return value.slice(0, 10);
    }
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private todayDateString(): string {
    return this.normalizeDateValue(new Date());
  }

  private startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
}
