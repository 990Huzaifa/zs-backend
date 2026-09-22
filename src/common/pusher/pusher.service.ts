import { Injectable, Logger } from '@nestjs/common';
import Pusher from 'pusher';

@Injectable()
export class PusherService {
  private readonly logger = new Logger(PusherService.name);
  private readonly pusher: Pusher | null;
  private readonly enabled: boolean;

  constructor() {
    const appId = process.env.PUSHER_APP_ID?.trim();
    const key = process.env.PUSHER_KEY?.trim();
    const secret = process.env.PUSHER_SECRET?.trim();
    const cluster = process.env.PUSHER_CLUSTER?.trim() || 'mt1';

    this.enabled = !!(appId && key && secret);
    if (!this.enabled) {
      this.logger.warn(
        'Pusher is not configured (missing PUSHER_* env). Realtime notifications disabled.',
      );
      this.pusher = null;
      return;
    }

    this.pusher = new Pusher({
      appId: appId!,
      key: key!,
      secret: secret!,
      cluster,
      useTLS: true,
    });
  }

  isEnabled() {
    return this.enabled;
  }

  userChannel(userId: string) {
    return `private-user-${userId}`;
  }

  async trigger(channel: string, event: string, data: unknown) {
    if (!this.pusher) return null;
    return this.pusher.trigger(channel, event, data);
  }

  /** Push an event to a user's private channel. */
  async triggerUser(userId: string, event: string, data: unknown) {
    if (!this.pusher) return null;
    try {
      return await this.pusher.trigger(this.userChannel(userId), event, data);
    } catch (err) {
      this.logger.warn(
        `Pusher trigger failed for ${userId}/${event}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  /** Fan-out the same event to many users (best-effort). */
  async triggerUsers(
    userIds: string[],
    event: string,
    dataForUser: (userId: string) => unknown,
  ) {
    if (!this.pusher || !userIds.length) return;
    await Promise.all(
      [...new Set(userIds)].map((userId) =>
        this.triggerUser(userId, event, dataForUser(userId)),
      ),
    );
  }

  authorizeChannel(socketId: string, channel: string) {
    if (!this.pusher) {
      throw new Error('Pusher is not configured');
    }
    return this.pusher.authorizeChannel(socketId, channel);
  }
}
