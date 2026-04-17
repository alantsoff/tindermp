import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
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
  'CUSTOM',
] as const;

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
  @IsBoolean()
  hideFromFeed?: boolean;
}
