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
  ChangeContraVoucherStatusDto,
  ContraVoucherListQueryDto,
  CreateContraVoucherDto,
  RemoveContraVoucherProofImageDto,
  UpdateContraVoucherDto,
} from '../auth/dto/contra-voucher.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { ContraVouchersService } from '../services/vouchers/contra.service';

@Controller('contra-vouchers')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ContraVouchersController {
  constructor(private readonly contraVouchersService: ContraVouchersService) {}

  @Post()
  @RequirePermissions('CREATE_CONTRA_VOUCHER')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateContraVoucherDto,
  ) {
    return this.contraVouchersService.create(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_CONTRA_VOUCHER')
  findAll(@Query() query: ContraVoucherListQueryDto) {
    return this.contraVouchersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_CONTRA_VOUCHER')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.contraVouchersService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_CONTRA_VOUCHER')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContraVoucherDto,
  ) {
    return this.contraVouchersService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_CONTRA_VOUCHER')
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeContraVoucherStatusDto,
  ) {
    return this.contraVouchersService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Post(':id/proof-images')
  @RequirePermissions('UPDATE_CONTRA_VOUCHER')
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
    return this.contraVouchersService.uploadProofImages(
      id,
      files,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id/proof-images')
  @RequirePermissions('UPDATE_CONTRA_VOUCHER')
  removeProofImage(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RemoveContraVoucherProofImageDto,
  ) {
    return this.contraVouchersService.removeProofImage(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }
}
