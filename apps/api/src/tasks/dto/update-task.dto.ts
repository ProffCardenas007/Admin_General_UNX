import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn([
    'revision',
    'edicion',
    'creacion',
    'presentaciones',
    'grabacion',
    'plataforma',
    'administrativo',
  ])
  activityType?:
    | 'revision'
    | 'edicion'
    | 'creacion'
    | 'presentaciones'
    | 'grabacion'
    | 'plataforma'
    | 'administrativo';

  @IsOptional()
  @IsString()
  assigneeId?: string | null;

  @IsOptional()
  @IsIn(['todo', 'doing', 'paused', 'blocked', 'done'])
  status?: 'todo' | 'doing' | 'paused' | 'blocked' | 'done';

  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'urgent'])
  priority?: 'low' | 'medium' | 'high' | 'urgent';

  @IsOptional()
  @IsString()
  dueDate?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedHours?: number;

  @IsOptional()
  @IsString()
  handoffToUserId?: string;

  @IsOptional()
  @IsString()
  handoffMessage?: string;

  @IsOptional()
  @IsIn([
    'revision',
    'edicion',
    'creacion',
    'presentaciones',
    'grabacion',
    'plataforma',
    'administrativo',
  ])
  nextActivityType?:
    | 'revision'
    | 'edicion'
    | 'creacion'
    | 'presentaciones'
    | 'grabacion'
    | 'plataforma'
    | 'administrativo';

  @IsOptional()
  @IsString()
  nextTitle?: string;

  @IsOptional()
  @IsString()
  nextDueDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  nextEstimatedHours?: number;
}
