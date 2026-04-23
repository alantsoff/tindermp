import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PauseDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}
