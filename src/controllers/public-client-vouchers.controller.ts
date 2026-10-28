import {
  Controller,
  Get,
  Param,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { DocumentOnlineVerificationGuard } from '../auth/guards/document-online-verification.guard';
import { ClientVouchersService } from '../services/vouchers/client.service';

/**
 * Unauthenticated client voucher view for shareable links.
 * Blocked when DOCUMENT_ONLINE_VERIFICATION.enabled is false.
 */
@Controller('public/client-vouchers')
@UseGuards(DocumentOnlineVerificationGuard)
export class PublicClientVouchersController {
  constructor(private readonly clientVouchersService: ClientVouchersService) {}

  @Get(':code/qr')
  async downloadQr(@Param('code') code: string): Promise<StreamableFile> {
    const { buffer, filename } =
      await this.clientVouchersService.getPublicQrPng(code);
    return new StreamableFile(buffer, {
      type: 'image/png',
      disposition: `inline; filename="${filename}"`,
    });
  }

  @Get(':code')
  findPublic(@Param('code') code: string) {
    return this.clientVouchersService.findPublic(code);
  }
}
