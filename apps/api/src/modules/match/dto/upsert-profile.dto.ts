import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const MATCH_ROLES = [
  'SELLER',
  'MANAGER',
  'DESIGNER',
  'AD_BUYER',
  'EXPERT',
  'PRODUCTION',
  'FULFILLMENT',
  'CARGO',
  'ANALYTICS_SERVICE',
  'LOGISTIC',
  'BLOGGER',
  'ACCOUNTANT',
  'LAWYER',
  'PRODUCT_SOURCER',
  'CUSTOM',
] as const;

export class UpsertProfileDto {
  @IsEnum(MATCH_ROLES)
  role!: (typeof MATCH_ROLES)[number];

  @ValidateIf((dto: UpsertProfileDto) => dto.role === 'CUSTOM')
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  roleCustom?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(64)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  headline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1500)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  niches!: string[];

  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  skills!: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  priceMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceMax?: number;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  portfolioUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  telegramContact?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEnum(MATCH_ROLES, { each: true })
  interestedRoles?: (typeof MATCH_ROLES)[number][];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  interestedNiches?: string[];
}

export type MatchRoleDto = (typeof MATCH_ROLES)[number];
