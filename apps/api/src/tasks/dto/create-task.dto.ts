import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTaskDto {
  @IsString()
  projectId: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  code?: string;

  @IsString()
  @IsIn([
    'revision',
    'edicion',
    'creacion',
    'presentaciones',
    'grabacion',
    'plataforma',
    'administrativo',
  ])
  activityType:
    | 'revision'
    | 'edicion'
    | 'creacion'
    | 'presentaciones'
    | 'grabacion'
    | 'plataforma'
    | 'administrativo';

  @IsString()
  @MaxLength(220)
  title: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsIn(['todo', 'doing', 'blocked', 'done'])
  status?: 'todo' | 'doing' | 'blocked' | 'done';

  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'urgent'])
  priority?: 'low' | 'medium' | 'high' | 'urgent';

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedHours?: number;
}
