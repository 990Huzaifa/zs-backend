import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class VendorDetailLedgerQueryDto {
  @IsUUID()
  vendorId: string;

  /** Statement end date (AS OF). Inclusive. */
  @IsDateString()
  asOf: string;

  /**
   * Optional period start. Inclusive.
   * Omit → full history to `asOf` (opening = 0).
   */
  @IsOptional()
  @IsDateString()
  dateFrom?: string;
}
