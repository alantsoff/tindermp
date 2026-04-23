import { IsString, Length } from 'class-validator';

export class RevokeInviteDto {
  @IsString()
  @Length(9, 9)
  code!: string;
}
