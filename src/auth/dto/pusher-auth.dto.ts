import { IsString } from 'class-validator';

export class PusherAuthDto {
  @IsString()
  socket_id: string;

  @IsString()
  channel_name: string;
}
