import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CALENDAR_PATTERN } from '../../common/calendar';

export const TEACHING_OPTIONS = {
  subjects: ['Español', 'Matemáticas'],
  programs: ['EXANI II', 'PAA'],
  modalities: ['Presencial', 'Virtual'],
  venues: ['López Cotilla', 'Medicina'],
};

export class TeachingProfileDto {
  @IsArray()
  @IsIn(TEACHING_OPTIONS.subjects, { each: true })
  subjects: string[];

  @IsArray()
  @IsIn(TEACHING_OPTIONS.programs, { each: true })
  programs: string[];

  @IsArray()
  @IsIn(TEACHING_OPTIONS.modalities, { each: true })
  modalities: string[];

  @IsArray()
  @IsIn(TEACHING_OPTIONS.venues, { each: true })
  venues: string[];
}

export class UpsertTeacherAvailabilityDto {
  /** Calendario al que pertenece `availability`; si falta, el vigente. */
  @IsOptional()
  @Matches(CALENDAR_PATTERN)
  calendar?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TeachingProfileDto)
  teaching?: TeachingProfileDto;

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
