import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import type { MatchRoleDto } from './upsert-profile.dto';

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
const MATCH_PHOTO_PREFERENCES = ['ANY', 'WITH_PHOTO', 'WITHOUT_PHOTO'] as const;

export class UpdateSettingsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEnum(MATCH_ROLES, { each: true })
  interestedRoles?: MatchRoleDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  interestedNiches?: string[];

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
  @IsInt()
  @Min(0)
  @Max(15)
  experienceMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(15)
  experienceMax?: number;

  @IsOptional()
  @IsEnum(MATCH_PHOTO_PREFERENCES)
  photoPreference?: (typeof MATCH_PHOTO_PREFERENCES)[number];

  @IsOptional()
  @IsBoolean()
  hideFromFeed?: boolean;
}
