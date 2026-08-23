import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AssignSessionCoverageDto {
  @IsOptional()
  @IsUUID()
  coverTeacherUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(260)
  coverageNote?: string;
}
