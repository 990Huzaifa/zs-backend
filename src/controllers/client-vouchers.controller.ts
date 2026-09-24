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
  ChangeClientVoucherStatusDto,
  CreateClientVoucherBatchDto,
  ClientVoucherListQueryDto,
  RemoveClientVoucherProofImageDto,
  UpdateClientVoucherDto,
} from '../auth/dto/client-voucher.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { ClientVouchersService } from '../services/vouchers/client.service';

@Controller('client-vouchers')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ClientVouchersController {
  constructor(
    private readonly clientVouchersService: ClientVouchersService,
  ) {}

  @Post()
  @RequirePermissions('CREATE_CLIENT_VOUCHER')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateClientVoucherBatchDto,
  ) {
    return this.clientVouchersService.createBatch(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_CLIENT_VOUCHER')
  findAll(@Query() query: ClientVoucherListQueryDto) {
    return this.clientVouchersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_CLIENT_VOUCHER')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientVouchersService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_CLIENT_VOUCHER')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientVoucherDto,
  ) {
    return this.clientVouchersService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_CLIENT_VOUCHER')
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeClientVoucherStatusDto,
  ) {
    return this.clientVouchersService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Post(':id/proof-images')
  @RequirePermissions('UPDATE_CLIENT_VOUCHER')
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
    return this.clientVouchersService.uploadProofImages(
      id,
      files,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id/proof-images')
  @RequirePermissions('UPDATE_CLIENT_VOUCHER')
  removeProofImage(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RemoveClientVoucherProofImageDto,
  ) {
    return this.clientVouchersService.removeProofImage(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_CLIENT_VOUCHER')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.clientVouchersService.remove(
      id,
      buildActivityContext(user, req),
    );
  }
}
