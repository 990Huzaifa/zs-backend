import {
  Controller,
  Get,
  Param,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { DocumentOnlineVerificationGuard } from '../auth/guards/document-online-verification.guard';
import { ExpenseVouchersService } from '../services/vouchers/expense.service';

/**
 * Unauthenticated expense voucher view for shareable links.
 * Blocked when DOCUMENT_ONLINE_VERIFICATION.enabled is false.
 */
@Controller('public/expense-vouchers')
@UseGuards(DocumentOnlineVerificationGuard)
export class PublicExpenseVouchersController {
  constructor(
    private readonly expenseVouchersService: ExpenseVouchersService,
  ) {}

  @Get(':code/qr')
  async downloadQr(@Param('code') code: string): Promise<StreamableFile> {
    const { buffer, filename } =
      await this.expenseVouchersService.getPublicQrPng(code);
    return new StreamableFile(buffer, {
      type: 'image/png',
      disposition: `inline; filename="${filename}"`,
    });
  }

  @Get(':code')
  findPublic(@Param('code') code: string) {
    return this.expenseVouchersService.findPublic(code);
  }
}
