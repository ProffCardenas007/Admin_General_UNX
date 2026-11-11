import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TASK_ACTIVITY_TYPES } from '../../database/entities/task.entity';

/** Tarea que alguien registra por su cuenta; queda pendiente de aprobación. */
export class SelfReportTaskDto {
  @IsUUID()
  projectId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(220)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description: string;

  /** Día en que se hizo (o se hará) la actividad. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  workDate: string;

  @IsNumber()
  @Min(0.25)
  @Max(80)
  estimatedHours: number;

  /** done = ya la hizo; todo = la va a hacer. */
  @IsOptional()
  @IsIn(['todo', 'done'])
  status?: 'todo' | 'done';
}

export class ReviewTaskDto {
  @IsIn(['approve', 'reject'])
  decision: 'approve' | 'reject';

  /** Categoría final al aprobar (por defecto se queda en administrativo). */
  @IsOptional()
  @IsIn(TASK_ACTIVITY_TYPES)
  activityType?: (typeof TASK_ACTIVITY_TYPES)[number];

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(80)
  estimatedHours?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
