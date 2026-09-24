import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class VendorLedgerQueryDto {
  @IsUUID()
  vendorId: string;

  /** Statement end date (AS OF). Inclusive. */
  @IsDateString()
  asOf: string;

  /**
   * Optional period start. Inclusive.
   * Agar na ho to full history `asOf` tak (opening = 0).
   */
  @IsOptional()
  @IsDateString()
  dateFrom?: string;
}
