import {
  Controller,
  Get,
  Param,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { DocumentOnlineVerificationGuard } from '../auth/guards/document-online-verification.guard';
import { MaintenanceVouchersService } from '../services/vouchers/maintenance.service';

/**
 * Unauthenticated maintenance voucher view for shareable links.
 * Blocked when DOCUMENT_ONLINE_VERIFICATION.enabled is false.
 */
@Controller('public/maintenance-vouchers')
@UseGuards(DocumentOnlineVerificationGuard)
export class PublicMaintenanceVouchersController {
  constructor(
    private readonly maintenanceVouchersService: MaintenanceVouchersService,
  ) {}

  @Get(':code/qr')
  async downloadQr(@Param('code') code: string): Promise<StreamableFile> {
    const { buffer, filename } =
      await this.maintenanceVouchersService.getPublicQrPng(code);
    return new StreamableFile(buffer, {
      type: 'image/png',
      disposition: `inline; filename="${filename}"`,
    });
  }

  @Get(':code')
  findPublic(@Param('code') code: string) {
    return this.maintenanceVouchersService.findPublic(code);
  }
}
