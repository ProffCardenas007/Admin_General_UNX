import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

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
