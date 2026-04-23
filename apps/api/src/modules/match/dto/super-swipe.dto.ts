import { IsString, MinLength } from 'class-validator';

export class SuperSwipeDto {
  @IsString()
  @MinLength(1)
  toProfileId!: string;
}
