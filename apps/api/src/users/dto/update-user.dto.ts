import {
  ArrayMaxSize,
  ArrayUnique,
  IsBoolean,
  IsEmail,
  IsIn,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { SPECIALTY_CODE_PATTERN } from '../../common/specialties';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsIn(['manager', 'lead', 'worker'])
  role?: 'manager' | 'lead' | 'worker';

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @Matches(SPECIALTY_CODE_PATTERN)
  specialty?: string | null;

  @IsOptional()
  @Transform(({ value }) => {
    if (!Array.isArray(value)) {
      return value;
    }

    return value.map((item) =>
      typeof item === 'string' ? item.trim().toLowerCase() : item,
    );
  })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(2)
  @Matches(SPECIALTY_CODE_PATTERN, { each: true })
  specialties?: string[] | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(120)
  password?: string;

  @IsOptional()
  @IsString()
  teamId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  teamIds?: string[] | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  classSubjects?: string[] | null;
}
