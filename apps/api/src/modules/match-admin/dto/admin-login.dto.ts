import { IsString, MinLength } from 'class-validator';

export class AdminLoginDto {
  @IsString()
  telegramId!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
