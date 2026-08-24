import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { SPECIALTY_CODE_PATTERN } from '../../common/specialties';

export class CreateProjectDto {
  @IsString()
  @MaxLength(40)
  code: string;

  @IsString()
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  clientName?: string;

  @IsOptional()
  @IsString()
  ownerTeamId?: string;

  @IsOptional()
  @Matches(SPECIALTY_CODE_PATTERN)
  scope?: string;

  @IsOptional()
  @IsIn(['planned', 'active', 'on_hold', 'done', 'cancelled'])
  status?: 'planned' | 'active' | 'on_hold' | 'done' | 'cancelled';

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
