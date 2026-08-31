import { Controller, Get, Param } from '@nestjs/common';
import { BiltysService } from '../services/biltys.service';

/**
 * Unauthenticated bilty view for shareable / printable links.
 * Example: GET /public/biltys/ZS000001
 */
@Controller('public/biltys')
export class PublicBiltysController {
  constructor(private readonly biltysService: BiltysService) {}

  @Get(':code')
  findPublic(@Param('code') code: string) {
    return this.biltysService.findPublic(code);
  }
}
