import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { LEAD_SPECIALTY_INPUTS } from '../../common/specialties';

export class CreateUserDto {
  @IsString()
  @MaxLength(120)
  fullName: string;

  @IsEmail()
  email: string;

  @IsIn(['manager', 'lead', 'worker'])
  role: 'manager' | 'lead' | 'worker';

  @IsOptional()
  @IsIn(LEAD_SPECIALTY_INPUTS)
  specialty?: (typeof LEAD_SPECIALTY_INPUTS)[number];

	@IsString()
	@MinLength(6)
	@MaxLength(120)
	password: string;

  @IsOptional()
  @IsString()
  teamId?: string;
}
