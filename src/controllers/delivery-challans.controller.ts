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
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import {
  CreateDeliveryChallanDto,
  DeliveryChallanListQueryDto,
  UpdateDeliveryChallanDto,
} from '../auth/dto/delivery-challan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { DeliveryChallanStatus } from '../database/entities/warehousing/delivery-challan.entity';
import { DeliveryChallansService } from '../services/delivery-challans.service';

@Controller('delivery-challans')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class DeliveryChallansController {
  constructor(
    private readonly deliveryChallansService: DeliveryChallansService,
  ) {}

  @Post()
  @RequirePermissions('CREATE_DELIVERY_CHALLAN')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateDeliveryChallanDto,
  ) {
    return this.deliveryChallansService.create(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('LIST_DELIVERY_CHALLAN')
  findAll(@Query() query: DeliveryChallanListQueryDto) {
    return this.deliveryChallansService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_DELIVERY_CHALLAN')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.deliveryChallansService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_DELIVERY_CHALLAN')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeliveryChallanDto,
  ) {
    return this.deliveryChallansService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/approve')
  @RequirePermissions('APPROVE_DELIVERY_CHALLAN')
  approve(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deliveryChallansService.changeStatus(
      id,
      { status: DeliveryChallanStatus.APPROVED },
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/complete')
  @RequirePermissions('COMPLETE_DELIVERY_CHALLAN')
  complete(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deliveryChallansService.changeStatus(
      id,
      { status: DeliveryChallanStatus.COMPLETED },
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/cancel')
  @RequirePermissions('CANCEL_DELIVERY_CHALLAN')
  cancel(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deliveryChallansService.changeStatus(
      id,
      { status: DeliveryChallanStatus.CANCELLED },
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_DELIVERY_CHALLAN')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deliveryChallansService.remove(
      id,
      buildActivityContext(user, req),
    );
  }
}
