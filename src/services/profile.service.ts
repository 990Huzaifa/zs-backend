import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { plainToInstance } from 'class-transformer';
import { ChangePasswordDto } from '../auth/dto/change-password.dto';
import { UpdateProfileDto } from '../auth/dto/update-profile.dto';
import { UserResponseDto } from '../auth/dto/user-response.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { User } from '../database/entities/user.entity';
import { ActivitiesService } from './activities.service';
import { UsersService } from './users.service';

@Injectable()
export class ProfileService {
  constructor(
    private readonly usersService: UsersService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.usersService.findByIdOrFail(userId);
    return this.toUserResponse(user);
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
    activity?: ActivityActorContext,
  ) {
    const user = await this.usersService.updateProfile(userId, {
      name: dto.name,
      phone: dto.phone,
      avatar: dto.avatar,
      deviceId: dto.deviceId,
      fcmToken: dto.fcmToken,
      appVersion: dto.appVersion,
    });

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'User',
        entityId: user.id,
        record: user.email ?? user.name,
        description: `Updated profile for ${user.name}`,
      },
      activity,
    );

    return this.toUserResponse(user);
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    activity?: ActivityActorContext,
  ) {
    const user = await this.usersService.findByIdOrFail(userId);
    if (!user.password) {
      throw new BadRequestException(
        'Password change is not available for social-only accounts',
      );
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.usersService.updatePassword(userId, hashedPassword);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.USERS_ACCESS,
        entityType: 'User',
        entityId: user.id,
        record: user.email ?? user.name,
        description: `Changed password for ${user.name}`,
      },
      activity,
    );

    return { message: 'Password changed successfully' };
  }

  private toUserResponse(user: User): UserResponseDto {
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }
}
