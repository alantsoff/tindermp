import { IsEnum, IsString, MinLength } from 'class-validator';

const SWIPE_DIRECTIONS = ['LIKE', 'PASS'] as const;

export class SwipeDto {
  @IsString()
  @MinLength(1)
  toProfileId!: string;

  @IsEnum(SWIPE_DIRECTIONS)
  direction!: (typeof SWIPE_DIRECTIONS)[number];
}
