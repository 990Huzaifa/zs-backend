import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import {
  CreateAdminUserDto,
  UpdateAdminUserDto,
  UserListQueryDto,
} from '../auth/dto/admin-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { UsersService } from '../services/users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequirePermissions('CREATE_USER')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateAdminUserDto,
  ) {
    return this.usersService.createAdminUser(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_USER')
  findAll(@Query() query: UserListQueryDto) {
    return this.usersService.findAllAdmin(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_USER')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOneAdmin(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_USER')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminUserDto,
  ) {
    return this.usersService.updateAdminUser(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }
}
