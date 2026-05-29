import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;

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
  @IsString()
  handoffToUserId?: string;

  @IsOptional()
  @IsString()
  handoffMessage?: string;

  @IsOptional()
  @IsIn(['revision', 'edicion', 'creacion', 'presentaciones', 'grabacion', 'plataforma'])
  nextActivityType?: 'revision' | 'edicion' | 'creacion' | 'presentaciones' | 'grabacion' | 'plataforma';

  @IsOptional()
  @IsString()
  nextTitle?: string;
}
