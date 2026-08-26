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
  UseGuards,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import {
  ChangeTaxRuleStatusDto,
  CreateTaxRuleDto,
  TaxRuleListQueryDto,
  UpdateTaxRuleDto,
} from '../auth/dto/tax-rule.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { TaxRulesService } from '../services/tax-rules.service';

@Controller('tax-rules')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class TaxRulesController {
  constructor(private readonly taxRulesService: TaxRulesService) {}

  @Post()
  @RequirePermissions('CREATE_TAX_RULE')
  create(@Body() dto: CreateTaxRuleDto) {
    return this.taxRulesService.create(dto);
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
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxRuleDto,
  ) {
    return this.taxRulesService.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_TAX_RULE')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeTaxRuleStatusDto,
  ) {
    return this.taxRulesService.changeStatus(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('DELETE_TAX_RULE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.taxRulesService.remove(id);
  }
}
