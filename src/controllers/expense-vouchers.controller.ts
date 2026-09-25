import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import {
  ChangeExpenseVoucherStatusDto,
  CreateExpenseVoucherBatchDto,
  ExpenseVoucherListQueryDto,
  RemoveExpenseVoucherProofImageDto,
  UpdateExpenseVoucherDto,
} from '../auth/dto/expense-voucher.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { ExpenseVouchersService } from '../services/vouchers/expense.service';

@Controller('expense-vouchers')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ExpenseVouchersController {
  constructor(
    private readonly expenseVouchersService: ExpenseVouchersService,
  ) {}

  @Post()
  @RequirePermissions('CREATE_EXPENSE_VOUCHER')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateExpenseVoucherBatchDto,
  ) {
    return this.expenseVouchersService.createBatch(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_EXPENSE_VOUCHER')
  findAll(@Query() query: ExpenseVoucherListQueryDto) {
    return this.expenseVouchersService.findAll(query);
  }

  @Get(':id/qr')
  @RequirePermissions('VIEW_EXPENSE_VOUCHER')
  async downloadQr(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { buffer, filename } =
      await this.expenseVouchersService.getPublicQrPng(id);
    return new StreamableFile(buffer, {
      type: 'image/png',
      disposition: `inline; filename="${filename}"`,
    });
  }

  @Get(':id')
  @RequirePermissions('VIEW_EXPENSE_VOUCHER')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.expenseVouchersService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_EXPENSE_VOUCHER')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseVoucherDto,
  ) {
    return this.expenseVouchersService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_EXPENSE_VOUCHER')
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeExpenseVoucherStatusDto,
  ) {
    return this.expenseVouchersService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Post(':id/proof-images')
  @RequirePermissions('UPDATE_EXPENSE_VOUCHER')
  @UseInterceptors(
    FilesInterceptor('images', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadProofImages(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.expenseVouchersService.uploadProofImages(
      id,
      files,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id/proof-images')
  @RequirePermissions('UPDATE_EXPENSE_VOUCHER')
  removeProofImage(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RemoveExpenseVoucherProofImageDto,
  ) {
    return this.expenseVouchersService.removeProofImage(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }
}
