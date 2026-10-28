import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { SystemSettingService } from '../../services/system-setting.service';

/**
 * Blocks unauthenticated `/public/...` document views when
 * DOCUMENT_ONLINE_VERIFICATION.enabled is false.
 */
@Injectable()
export class DocumentOnlineVerificationGuard implements CanActivate {
  constructor(
    private readonly systemSettingService: SystemSettingService,
  ) {}

  async canActivate(_context: ExecutionContext): Promise<boolean> {
    const enabled =
      await this.systemSettingService.isDocumentOnlineVerificationEnabled();
    if (!enabled) {
      throw new ForbiddenException(
        'Document online verification is disabled',
      );
    }
    return true;
  }
}
