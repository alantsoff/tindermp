import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class AdminIssueInvitesDto {
  @IsInt()
  @Min(1)
  @Max(100)
  count!: number;

  @IsOptional()
  @IsString()
  ownerProfileId?: string;
}
