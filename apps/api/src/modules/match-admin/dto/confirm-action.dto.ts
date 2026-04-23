import { IsString, MinLength } from 'class-validator';

export class ConfirmActionDto {
  @IsString()
  confirmToken!: string;

  @IsString()
  @MinLength(3)
  reason!: string;
}
