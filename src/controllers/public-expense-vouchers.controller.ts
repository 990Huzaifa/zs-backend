import { Controller, Get, Param, StreamableFile } from '@nestjs/common';
import { ExpenseVouchersService } from '../services/vouchers/expense.service';

/**
 * Unauthenticated expense voucher view for shareable links.
 * Example: GET /public/expense-vouchers/EV000001
 * QR PNG:  GET /public/expense-vouchers/EV000001/qr
 *
 * QR encodes: `{FRONTEND_URL}/public/expense-vouchers/EV000001`
 */
@Controller('public/expense-vouchers')
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
