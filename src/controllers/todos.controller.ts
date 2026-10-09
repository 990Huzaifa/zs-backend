import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import {
  CreateTodoDto,
  QuickCreateTodoDto,
  ReorderTodosDto,
  TodoListQueryDto,
  UpdateTodoDto,
} from '../auth/dto/todo.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { User } from '../database/entities/user.entity';
import { TodosService } from '../services/todos.service';

@Controller('todos')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class TodosController {
  constructor(private readonly todosService: TodosService) {}

  @Post()
  @RequirePermissions('CREATE_TODO')
  create(@CurrentUser() user: User, @Body() dto: CreateTodoDto) {
    return this.todosService.create(user.id, dto);
  }

  /**
   * FAB / "+ Add Todo" — create sticky with defaults (yellow, today, pending).
   */
  @Post('quick')
  @RequirePermissions('CREATE_TODO')
  quickCreate(
    @CurrentUser() user: User,
    @Body() dto: QuickCreateTodoDto,
  ) {
    return this.todosService.quickCreate(user.id, dto ?? {});
  }

  @Get()
  @RequirePermissions('VIEW_TODO')
  findAll(@CurrentUser() user: User, @Query() query: TodoListQueryDto) {
    return this.todosService.findAll(user.id, query);
  }

  @Patch('reorder')
  @RequirePermissions('UPDATE_TODO')
  reorder(@CurrentUser() user: User, @Body() dto: ReorderTodosDto) {
    return this.todosService.reorder(user.id, dto);
  }

  @Get(':id')
  @RequirePermissions('VIEW_TODO')
  findOne(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.todosService.findOne(user.id, id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_TODO')
  update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTodoDto,
  ) {
    return this.todosService.update(user.id, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('DELETE_TODO')
  remove(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.todosService.remove(user.id, id);
  }
}
