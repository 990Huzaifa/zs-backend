import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TodoStatus } from '../../database/entities/todo.entity';

/** Sticky palette from softboard UI. */
export const TODO_COLOR_PRESETS = [
  '#FEF3C7', // yellow
  '#FECACA', // pink
  '#BFDBFE', // blue
  '#BBF7D0', // green
  '#E9D5FF', // purple
] as const;

export class CreateTodoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  body?: string | null;

  @IsOptional()
  @IsEnum(TodoStatus)
  status?: TodoStatus;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  color?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;
}

/**
 * FAB / "+ Add Todo" — minimal payload; server fills sticky defaults
 * (yellow color, today due date, pending, unpinned).
 */
export class QuickCreateTodoDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  body?: string | null;

  @IsOptional()
  @IsString()
  @IsIn([...TODO_COLOR_PRESETS])
  color?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;
}

export class UpdateTodoDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  body?: string | null;

  @IsOptional()
  @IsEnum(TodoStatus)
  status?: TodoStatus;

  /** Softboard checkbox — maps to status done / pending. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  completed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  color?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;
}

export class TodoListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(TodoStatus)
  status?: TodoStatus;

  @IsOptional()
  @IsString()
  search?: string;
}

export class TodoReorderItemDto {
  @IsUUID()
  id: string;

  @Type(() => Number)
  @IsInt()
  sortOrder: number;
}

export class ReorderTodosDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TodoReorderItemDto)
  items: TodoReorderItemDto[];
}
