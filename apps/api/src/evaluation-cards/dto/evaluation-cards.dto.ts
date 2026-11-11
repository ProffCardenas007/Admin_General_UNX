import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const SURVEY_TYPES = ['lider', 'profesor'] as const;
export const SURVEY_TEXT_FIELDS = [
  'strengths',
  'improvements',
  'comments',
] as const;

export class SemesterRefDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @IsInt()
  @Min(1)
  @Max(2)
  semester: number;
}

export class SurveyResponseItemDto {
  @IsString()
  @MaxLength(160)
  subjectKey: string;

  @IsString()
  @MaxLength(160)
  subjectName: string;

  @IsOptional()
  @IsUUID()
  subjectUserId?: string | null;

  /** Criterio → calificación de 1 a 5. */
  @IsObject()
  scores: Record<string, number>;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  strengths?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  improvements?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  comments?: string | null;
}

export class ImportSurveyDto extends SemesterRefDto {
  @IsIn(SURVEY_TYPES)
  surveyType: (typeof SURVEY_TYPES)[number];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => SurveyResponseItemDto)
  responses: SurveyResponseItemDto[];
}

export class SetHiddenFieldsDto {
  @IsArray()
  @IsIn(SURVEY_TEXT_FIELDS, { each: true })
  hiddenFields: (typeof SURVEY_TEXT_FIELDS)[number][];
}

export class SaveCardNoteDto extends SemesterRefDto {
  @IsString()
  @MaxLength(160)
  subjectKey: string;

  @IsString()
  @MaxLength(160)
  subjectName: string;

  @IsOptional()
  @IsUUID()
  subjectUserId?: string | null;

  @IsString()
  @MaxLength(10000)
  comments: string;
}

export class FetchSheetDto {
  @IsString()
  @MaxLength(500)
  url: string;
}
