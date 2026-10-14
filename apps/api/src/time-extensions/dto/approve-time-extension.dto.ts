import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ApproveTimeExtensionDto {
  /** Hours to grant; defaults to the requested amount when omitted. */
  @IsOptional()
  @IsNumber()
  @Min(0.25)
  @Max(200)
  approvedHours?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
