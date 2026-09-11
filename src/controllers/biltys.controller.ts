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
  BiltyExpenseListQueryDto,
  BiltyListQueryDto,
  ChangeBiltyExpenseStatusDto,
  ChangeBiltyStatusDto,
  CreateBiltyDto,
  CreateBiltyExpenseDto,
  UpdateBiltyDto,
  UpdateBiltyExpenseDto,
} from '../auth/dto/bilty.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { BiltyExpensesService } from '../services/bilty-expenses.service';
import { BiltyPdfService } from '../services/pdf/bilty-pdf.service';
import { BiltysService } from '../services/biltys.service';

@Controller('biltys')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class BiltysController {
  constructor(
    private readonly biltysService: BiltysService,
    private readonly biltyExpensesService: BiltyExpensesService,
    private readonly biltyPdfService: BiltyPdfService,
  ) {}

  @Post()
  @RequirePermissions('CREATE_BILTY')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateBiltyDto,
  ) {
    return this.biltysService.create(
      dto,
      user.id,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_BILTY')
  findAll(@Query() query: BiltyListQueryDto) {
    return this.biltysService.findAll(query);
  }

  @Get(':id/pdf')
  @RequirePermissions('VIEW_BILTY')
  async downloadPdf(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.biltyPdfService.generateById(id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  // --- Bilty expenses ---

  @Post(':id/expenses')
  @RequirePermissions('UPDATE_BILTY')
  createExpense(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBiltyExpenseDto,
  ) {
    return this.biltyExpensesService.create(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get(':id/expenses')
  @RequirePermissions('VIEW_BILTY')
  listExpenses(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: BiltyExpenseListQueryDto,
  ) {
    return this.biltyExpensesService.findAll(id, query);
  }

  @Get(':id/expenses/:expenseId')
  @RequirePermissions('VIEW_BILTY')
  getExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
  ) {
    return this.biltyExpensesService.findOne(id, expenseId);
  }

  @Put(':id/expenses/:expenseId')
  @RequirePermissions('UPDATE_BILTY')
  updateExpense(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @Body() dto: UpdateBiltyExpenseDto,
  ) {
    return this.biltyExpensesService.update(
      id,
      expenseId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/expenses/:expenseId/status')
  @RequirePermissions('UPDATE_BILTY')
  changeExpenseStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @Body() dto: ChangeBiltyExpenseStatusDto,
  ) {
    return this.biltyExpensesService.changeStatus(
      id,
      expenseId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_BILTY')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.biltysService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_BILTY')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBiltyDto,
  ) {
    return this.biltysService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_BILTY')
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeBiltyStatusDto,
  ) {
    return this.biltysService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }
}
