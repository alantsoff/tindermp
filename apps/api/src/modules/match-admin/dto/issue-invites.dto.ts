import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class IssueToSelfDto {
  @IsInt()
  @Min(1)
  @Max(100)
  count!: number;
}

export class IssueToProfileDto {
  @IsString()
  profileId!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  count!: number;

  @IsString()
  @MinLength(3)
  reason!: string;
}

export class IssueDetachedDto {
  @IsInt()
  @Min(1)
  @Max(500)
  count!: number;

  @IsOptional()
  @IsString()
  label?: string;

  @IsString()
  @MinLength(3)
  reason!: string;
}

export class IssueToAdminsDto {
  @IsInt()
  @Min(5)
  @Max(100)
  count!: number;

  @IsString()
  @MinLength(3)
  reason!: string;
}

export class BulkGiftInvitesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  profileIds!: string[];

  @IsInt()
  @Min(1)
  @Max(20)
  countEach!: number;

  @IsString()
  @MinLength(3)
  reason!: string;
}
