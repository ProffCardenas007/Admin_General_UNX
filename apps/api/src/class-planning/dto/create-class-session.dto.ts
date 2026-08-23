import { IsDateString, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CreateClassSessionDto {
  @IsUUID()
  courseId: string;

  @IsUUID()
  subjectId: string;

  @IsUUID()
  teacherUserId: string;

  @IsDateString()
  classDate: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime: string;

  @IsString()
  @MaxLength(40)
  classroom: string;

  @IsOptional()
  @IsString()
  @MaxLength(260)
  notes?: string;
}
