import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
} from 'class-validator';

export class CreateTaskUpdateDto {
  @IsString()
  taskId: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsString()
  updateDate: string;

  @IsNumber()
  @Min(0)
  workedHours: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  progressPercent: number;

  @IsOptional()
  @IsString()
  blockerReason?: string;

  @IsOptional()
  @IsString()
  comments?: string;
}
