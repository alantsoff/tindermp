import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class BanProfileDto {
  @IsString()
  @MinLength(3)
  reason!: string;

  @IsOptional()
  @IsBoolean()
  shadow?: boolean;
}
