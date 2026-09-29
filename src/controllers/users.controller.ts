import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { memoryStorage } from 'multer';
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

  @Post(':id/avatar')
  @RequirePermissions('UPDATE_USER')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadAvatar(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.usersService.uploadAvatar(
      id,
      file,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id/avatar')
  @RequirePermissions('UPDATE_USER')
  removeAvatar(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.usersService.removeAvatar(
      id,
      buildActivityContext(user, req),
    );
  }
}
