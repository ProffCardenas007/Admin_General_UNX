import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateClassSubjectDto {
  @IsString()
  @MaxLength(140)
  name: string;

  @IsOptional()
  @IsUUID()
  teacherUserId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  displayOrder?: number;
}
