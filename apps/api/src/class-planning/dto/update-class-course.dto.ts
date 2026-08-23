import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateClassCourseDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  sectionCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  classroom?: string;

  @IsOptional()
  @IsIn(['presencial', 'virtual'])
  modality?: 'presencial' | 'virtual';

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  @MaxLength(5)
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  @MaxLength(5)
  endTime?: string;

  @IsOptional()
  @IsDateString()
  termStartDate?: string | null;

  @IsOptional()
  @IsDateString()
  termEndDate?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
