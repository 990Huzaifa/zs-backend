import { Controller, Get, Param, StreamableFile } from '@nestjs/common';
import { MaintenanceVouchersService } from '../services/vouchers/maintenance.service';

/**
 * Unauthenticated maintenance voucher view for shareable links.
 * Example: GET /public/maintenance-vouchers/MV000001
 * QR PNG:  GET /public/maintenance-vouchers/MV000001/qr
 *
 * QR encodes: `{FRONTEND_URL}/public/maintenance-vouchers/MV000001`
 */
@Controller('public/maintenance-vouchers')
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
