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
  ChangeTaxRuleStatusDto,
  CreateTaxRuleDto,
  TaxRuleListQueryDto,
  UpdateTaxRuleDto,
} from '../auth/dto/tax-rule.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { TaxRulesService } from '../services/tax-rules.service';

@Controller('tax-rules')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class TaxRulesController {
  constructor(private readonly taxRulesService: TaxRulesService) {}

  @Post()
  @RequirePermissions('CREATE_TAX_RULE')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateTaxRuleDto,
  ) {
    return this.taxRulesService.create(dto, buildActivityContext(user, req));
  }

  @Get()
  @RequirePermissions('VIEW_TAX_RULE')
  findAll(@Query() query: TaxRuleListQueryDto) {
    return this.taxRulesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_TAX_RULE')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.taxRulesService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_TAX_RULE')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxRuleDto,
  ) {
    return this.taxRulesService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_TAX_RULE')
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeTaxRuleStatusDto,
  ) {
    return this.taxRulesService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_TAX_RULE')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.taxRulesService.remove(id, buildActivityContext(user, req));
  }
}
