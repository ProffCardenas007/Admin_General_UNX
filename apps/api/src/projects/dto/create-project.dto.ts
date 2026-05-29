import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PROJECT_SCOPES } from '../../common/specialties';

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
  @IsIn(PROJECT_SCOPES)
  scope?: (typeof PROJECT_SCOPES)[number];

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
