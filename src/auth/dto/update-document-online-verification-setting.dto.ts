import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateDocumentOnlineVerificationSettingDto {
  /**
   * When `false`, public QR / scan pages (`/public/...`) are disabled.
   * Downloads may still include a QR, but scanning will not open a public view.
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return value;
  })
  @IsBoolean()
  enabled?: boolean;
}
