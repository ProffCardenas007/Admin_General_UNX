import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateClassCourseDto {
  @IsString()
  @MaxLength(40)
  code: string;

  @IsString()
  @MaxLength(20)
  sectionCode: string;

  @IsString()
  @MaxLength(160)
  name: string;

  @IsIn(['presencial', 'virtual'])
  modality: 'presencial' | 'virtual';

  @IsString()
  @MaxLength(40)
  classroom: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  @MaxLength(5)
  startTime: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  @MaxLength(5)
  endTime: string;

  @IsOptional()
  @IsDateString()
  termStartDate?: string;

  @IsOptional()
  @IsDateString()
  termEndDate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
