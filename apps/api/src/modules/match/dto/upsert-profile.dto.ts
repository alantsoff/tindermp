import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  Length,
  IsOptional,
  IsString,
  Matches,
  Max,
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
  'ASSISTANTS',
  'WHITE_IMPORT',
  'CUSTOM',
] as const;

const MATCH_WORK_FORMATS = ['REMOTE', 'OFFICE', 'HYBRID'] as const;
const MATCH_MARKETPLACES = [
  'WB',
  'OZON',
  'YANDEX_MARKET',
  'MVIDEO',
  'LAMODA',
  'OTHER',
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

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(15)
  experience?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsEnum(MATCH_WORK_FORMATS, { each: true })
  workFormats?: (typeof MATCH_WORK_FORMATS)[number][];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEnum(MATCH_MARKETPLACES, { each: true })
  marketplaces?: (typeof MATCH_MARKETPLACES)[number][];

  @ValidateIf(
    (dto: UpsertProfileDto) => dto.marketplaces?.includes('OTHER') ?? false,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  marketplacesCustom?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  birthDate?: string;

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  niches!: string[];

  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  skills!: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  tools?: string[];

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
  @IsString()
  @MaxLength(64)
  @Length(9, 9)
  inviteCode?: string;

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
  @ArrayMaxSize(3)
  @IsEnum(MATCH_WORK_FORMATS, { each: true })
  interestedWorkFormats?: (typeof MATCH_WORK_FORMATS)[number][];

  @IsOptional()
  @IsBoolean()
  sameCityOnly?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEnum(MATCH_MARKETPLACES, { each: true })
  interestedMarketplaces?: (typeof MATCH_MARKETPLACES)[number][];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  interestedNiches?: string[];
}

export type MatchRoleDto = (typeof MATCH_ROLES)[number];
