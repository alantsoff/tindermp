import { IsOptional, IsString } from 'class-validator';

export class RecomputeSpamDto {
  @IsOptional()
  @IsString()
  profileId?: string;
}
