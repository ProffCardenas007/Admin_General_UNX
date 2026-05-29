import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { LEAD_SPECIALTIES } from '../../common/specialties';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsIn(['manager', 'lead', 'worker'])
  role?: 'manager' | 'lead' | 'worker';

  @IsOptional()
  @IsIn(LEAD_SPECIALTIES)
  specialty?: (typeof LEAD_SPECIALTIES)[number] | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(120)
  password?: string;
}
