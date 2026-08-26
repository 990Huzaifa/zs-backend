import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import {
  CreateClientTypeDto,
  UpdateClientTypeDto,
} from '../auth/dto/client-type.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { ClientTypesService } from '../services/client-types.service';

@Controller('client-types')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ClientTypesController {
  constructor(private readonly clientTypesService: ClientTypesService) {}

  @Post()
  @RequirePermissions('CREATE_CLIENT_TYPE')
  create(@Body() dto: CreateClientTypeDto) {
    return this.clientTypesService.create(dto);
  }

  @Get()
  @RequirePermissions('VIEW_CLIENT_TYPE')
  findAll() {
    return this.clientTypesService.findAll();
  }

  @Get(':id')
  @RequirePermissions('VIEW_CLIENT_TYPE')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientTypesService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_CLIENT_TYPE')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientTypeDto,
  ) {
    return this.clientTypesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('DELETE_CLIENT_TYPE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientTypesService.remove(id);
  }
}
