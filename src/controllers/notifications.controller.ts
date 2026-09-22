import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import { NotificationListQueryDto } from '../auth/dto/notification.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { User } from '../database/entities/user.entity';
import { NotificationsService } from '../services/notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @RequirePermissions('VIEW_NOTIFICATION')
  findMine(
    @CurrentUser() user: User,
    @Query() query: NotificationListQueryDto,
  ) {
    return this.notificationsService.findMyNotifications(user.id, query);
  }

  @Get('unread-count')
  @RequirePermissions('VIEW_NOTIFICATION')
  unreadCount(@CurrentUser() user: User) {
    return this.notificationsService.getUnreadCount(user.id);
  }

  @Patch('read-all')
  @RequirePermissions('VIEW_NOTIFICATION')
  markAllRead(@CurrentUser() user: User) {
    return this.notificationsService.markAllRead(user.id);
  }

  @Patch(':recipientId/read')
  @RequirePermissions('VIEW_NOTIFICATION')
  markRead(
    @CurrentUser() user: User,
    @Param('recipientId', ParseUUIDPipe) recipientId: string,
  ) {
    return this.notificationsService.markRead(user.id, recipientId);
  }

  @Patch(':recipientId/dismiss')
  @RequirePermissions('VIEW_NOTIFICATION')
  dismiss(
    @CurrentUser() user: User,
    @Param('recipientId', ParseUUIDPipe) recipientId: string,
  ) {
    return this.notificationsService.dismiss(user.id, recipientId);
  }
}
