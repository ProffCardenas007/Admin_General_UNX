import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class MarkTaskNotCompletedDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;

  @IsOptional()
  @IsString()
  reassignToUserId?: string;
}