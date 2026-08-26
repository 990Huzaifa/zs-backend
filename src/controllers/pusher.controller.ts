import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PusherAuthDto } from '../auth/dto/pusher-auth.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../database/entities/user.entity';
import { PusherService } from '../common/pusher/pusher.service';

@Controller('pusher')
@UseGuards(JwtAuthGuard)
export class PusherController {
  constructor(private readonly pusherService: PusherService) {}

  /**
   * Authenticates private channel subscriptions for the logged-in user.
   * Client channel must be: private-user-{userId}
   */
  @Post('auth')
  @HttpCode(HttpStatus.OK)
  auth(@CurrentUser() user: User, @Body() dto: PusherAuthDto) {
    const expectedChannel = `private-user-${user.id}`;
    if (dto.channel_name !== expectedChannel) {
      throw new ForbiddenException('Invalid channel');
    }

    return this.pusherService.authorizeChannel(dto.socket_id, dto.channel_name);
  }
}
