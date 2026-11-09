import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateWorkPlanDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn(['blank', 'manual'])
  template?: 'blank' | 'manual';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  topics?: number;
}

export class UpdateWorkPlanDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class CreateSectionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title: string;

  @IsOptional()
  @IsBoolean()
  spansAll?: boolean;
}

export class UpdateSectionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

export class LabelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  label: string;
}

export class UpdateLabelDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  label?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

export class UpsertCellDto {
  @IsUUID()
  rowId: string;

  @IsOptional()
  @IsUUID()
  columnId?: string;

  @IsOptional()
  @IsIn(['unassigned', 'assigned', 'in_progress', 'done', 'blocked'])
  status?: 'unassigned' | 'assigned' | 'in_progress' | 'done' | 'blocked';

  @IsOptional()
  @Matches(DATE)
  startDate?: string | null;

  @IsOptional()
  @Matches(DATE)
  endDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  suggestedAssignee?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

export class MergeCellDto {
  @IsUUID()
  rowId: string;

  @IsUUID()
  columnId: string;

  @IsInt()
  @Min(1)
  @Max(60)
  columnSpan: number;
}

export class CreateCellTaskDto {
  @IsUUID()
  rowId: string;

  @IsOptional()
  @IsUUID()
  columnId?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

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
  @MinLength(1)
  @MaxLength(220)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  description: string;

  @IsIn(['low', 'medium', 'high', 'urgent'])
  priority: 'low' | 'medium' | 'high' | 'urgent';

  @Matches(DATE)
  dueDate: string;

  @IsNumber()
  @Min(0)
  estimatedHours: number;

  @IsOptional()
  @Matches(DATE)
  startDate?: string | null;

  @IsOptional()
  @Matches(DATE)
  endDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}
