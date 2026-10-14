import {
  IsNumber,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTimeExtensionRequestDto {
  @IsUUID()
  taskId: string;

  @IsNumber()
  @Min(0.25)
  @Max(200)
  requestedHours: number;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason: string;
}
