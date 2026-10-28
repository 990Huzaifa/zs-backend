import {
  Controller,
  Get,
  Param,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { DocumentOnlineVerificationGuard } from '../auth/guards/document-online-verification.guard';
import { ContraVouchersService } from '../services/vouchers/contra.service';

/**
 * Unauthenticated contra voucher view for shareable links.
 * Blocked when DOCUMENT_ONLINE_VERIFICATION.enabled is false.
 */
@Controller('public/contra-vouchers')
@UseGuards(DocumentOnlineVerificationGuard)
export class PublicContraVouchersController {
  constructor(private readonly contraVouchersService: ContraVouchersService) {}

  @Get(':code/qr')
  async downloadQr(@Param('code') code: string): Promise<StreamableFile> {
    const { buffer, filename } =
      await this.contraVouchersService.getPublicQrPng(code);
    return new StreamableFile(buffer, {
      type: 'image/png',
      disposition: `inline; filename="${filename}"`,
    });
  }

  @Get(':code')
  findPublic(@Param('code') code: string) {
    return this.contraVouchersService.findPublic(code);
  }
}
