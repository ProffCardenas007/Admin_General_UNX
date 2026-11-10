import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SaveSemesterWeightsDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @IsInt()
  @Min(1)
  @Max(2)
  semester: number;

  @IsObject()
  weights: Record<string, number>;
}

export class SaveTaskEvaluationDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  grade: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comments?: string;
}

export class TaskGradeItemDto {
  @IsUUID()
  taskId: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  grade: number;
}

export class SaveTaskEvaluationsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => TaskGradeItemDto)
  evaluations: TaskGradeItemDto[];
}
