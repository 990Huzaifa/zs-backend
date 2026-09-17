import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import {
  ChangeClientInvoiceStatusDto,
  CreateClientInvoiceDto,
  ClientInvoiceListQueryDto,
  UpdateClientInvoiceDto,
} from '../auth/dto/client-invoice.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { ClientInvoicesService } from '../services/client-invoices.service';
import { InvoicePdfService } from '../services/pdf/invoice-pdf.service';

@Controller('client-invoices')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ClientInvoicesController {
  constructor(
    private readonly clientInvoicesService: ClientInvoicesService,
    private readonly invoicePdfService: InvoicePdfService,
  ) {}

  @Post()
  @RequirePermissions('CREATE_CLIENT_INVOICE')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateClientInvoiceDto,
  ) {
    return this.clientInvoicesService.create(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_CLIENT_INVOICE')
  findAll(@Query() query: ClientInvoiceListQueryDto) {
    return this.clientInvoicesService.findAll(query);
  }

  @Get(':id/qr')
  @RequirePermissions('VIEW_CLIENT_INVOICE')
  async downloadQr(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { buffer, filename } =
      await this.clientInvoicesService.getPublicQrPng(id);
    return new StreamableFile(buffer, {
      type: 'image/png',
      disposition: `inline; filename="${filename}"`,
    });
  }

  @Get(':id/pdf')
  @RequirePermissions('VIEW_CLIENT_INVOICE')
  async downloadPdf(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.invoicePdfService.generateById(id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get(':id')
  @RequirePermissions('VIEW_CLIENT_INVOICE')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientInvoicesService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_CLIENT_INVOICE')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientInvoiceDto,
  ) {
    return this.clientInvoicesService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_CLIENT_INVOICE')
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeClientInvoiceStatusDto,
  ) {
    return this.clientInvoicesService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }
}
