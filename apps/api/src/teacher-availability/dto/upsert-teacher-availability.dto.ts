import { IsArray, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertTeacherAvailabilityDto {
  @IsOptional()
  @IsObject()
  availability?: Record<string, string>;

  @IsOptional()
  @IsArray()
  incidences?: Array<{
    id?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
    reason?: string;
  }>;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  updatedAt?: string;
}
