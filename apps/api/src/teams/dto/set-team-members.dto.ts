import { IsArray, IsOptional, IsString } from 'class-validator';

export class SetTeamMembersDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userIds?: string[];
}
