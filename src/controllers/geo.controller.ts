import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { GeoService } from '../services/geo.service';

@Controller('geo')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  @Get('countries')
  @RequirePermissions('VIEW_COUNTRY')
  listCountries(@Query('all') all?: string) {
    return this.geoService.listCountries(all !== 'true');
  }

  @Get('countries/:countryId')
  @RequirePermissions('VIEW_COUNTRY')
  getCountry(@Param('countryId') countryId: string) {
    return this.geoService.getCountry(countryId.toString());
  }

  @Get('countries/:countryId/states')
  @RequirePermissions('VIEW_STATE')
  listStates(
    @Param('countryId') countryId: number,
    @Query('all') all?: string,
  ) {
    return this.geoService.listStatesByCountry(countryId.toString(), all !== 'true');
  }

  @Get('states/:stateId/cities')
  @RequirePermissions('VIEW_CITY')
  listCities(
    @Param('stateId') stateId: number,
    @Query('all') all?: string,
  ) {
    return this.geoService.listCitiesByState(stateId.toString(), all !== 'true');
  }
}
