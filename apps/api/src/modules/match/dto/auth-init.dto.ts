import { IsString, MinLength } from 'class-validator';

export class AuthInitDto {
  @IsString()
  @MinLength(1)
  initData!: string;
}
