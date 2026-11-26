import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Qué hacer con el material que ya no se usará. */
const DISPOSITIONS = ['conservar', 'reutilizar', 'donar', 'reciclar'] as const;
const PROGRAMS = ['PAA', 'EXANI', 'PIENSE'] as const;
/** En la importación, "INSUMO" manda la fila al inventario de insumos (papelería, artículos de paquete). */
const IMPORT_PROGRAMS = ['PAA', 'EXANI', 'PIENSE', 'INSUMO'] as const;
/** Sedes permitidas (lista cerrada; la pantalla usa la misma). */
const VENUES = [
  'Presencial · López Cotilla',
  'Presencial · Medicina',
  'Virtual',
];

export class CreateMaterialItemDto {
  @IsIn(PROGRAMS)
  program: 'PAA' | 'EXANI' | 'PIENSE';

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  kind: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  version?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  module?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  available?: number;
}

export class UpdateMaterialItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  kind?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  version?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  module?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  available?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  printQty?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  doNotUse?: boolean;

  /** Destino del material retirado (null = por decidir). */
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsIn(DISPOSITIONS)
  disposition?: string | null;

  @IsOptional()
  @IsBoolean()
  reviewed?: boolean;
}

export class BulkUpdateMaterialItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  ids: string[];

  @IsOptional()
  @IsBoolean()
  reviewed?: boolean;

  @IsOptional()
  @IsBoolean()
  doNotUse?: boolean;
}

export class SetAssignmentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  itemIds: string[];

  @IsUUID()
  groupId: string;

  @IsBoolean()
  assigned: boolean;
}

export class CreateMaterialGroupDto {
  @IsIn(PROGRAMS)
  program: 'PAA' | 'EXANI' | 'PIENSE';

  /** Si ya existe un curso con este nombre, el grupo se suma a él. */
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  courseLabel: string;

  @IsOptional()
  @IsIn(VENUES)
  venue?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  students?: number;

  @IsOptional()
  @IsBoolean()
  counts?: boolean;
}

export class UpdateMaterialGroupDto {
  /** Renombra el curso completo (todas sus sedes). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  courseLabel?: string;

  @IsOptional()
  @IsIn(VENUES)
  venue?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  students?: number;

  /** null = borrar la captura. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  enrolled?: number | null;

  @IsOptional()
  @IsBoolean()
  counts?: boolean;
}

export class UpdateKitItemDto {
  /** Insumo del inventario al que corresponde este renglón (null lo desvincula). Aplica a todos los cursos del programa. */
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  supplyId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  qty?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  item?: string;
}

export class CreateKitItemDto {
  @IsIn(PROGRAMS)
  program: 'PAA' | 'EXANI' | 'PIENSE';

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  courseKey: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  item: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  qty?: number;
}

export class ImportItemRowDto {
  /** Si viene, manda sobre el programa general de la importación. */
  @IsOptional()
  @IsIn(IMPORT_PROGRAMS)
  program?: 'PAA' | 'EXANI' | 'PIENSE' | 'INSUMO';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  doNotUse?: boolean;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  kind: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  version?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  module?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  available?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  printQty?: number;
}

export class ImportMaterialItemsDto {
  @IsIn(PROGRAMS)
  program: 'PAA' | 'EXANI' | 'PIENSE';

  /** replace: el disponible importado sustituye al actual. add: se suma al actual. */
  @IsIn(['replace', 'add'])
  mode: 'replace' | 'add';

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ImportItemRowDto)
  rows: ImportItemRowDto[];
}

export class UpdateScheduleEntryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  label?: string;

  @IsOptional()
  @Matches(DATE)
  weekStart?: string;

  /** Tipo de semana: lleva examen, sin examen o situación especial (gris). */
  @IsOptional()
  @IsIn(['exam', 'none', 'break'])
  kind?: 'exam' | 'none' | 'break';
}

export class CreateScheduleEntryDto {
  @IsIn(PROGRAMS)
  program: 'PAA' | 'EXANI' | 'PIENSE';

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  courseKey: string;

  @Matches(DATE)
  weekStart: string;

  @IsOptional()
  @IsIn(['exam', 'none', 'break'])
  kind?: 'exam' | 'none' | 'break';

  @IsOptional()
  @IsString()
  @MaxLength(160)
  label?: string;
}

export class SetCourseStartDto {
  /** Fecha de inicio de clases (AAAA-MM-DD). null la quita. */
  @IsOptional()
  @Matches(DATE)
  startDate?: string | null;
}

export class ShiftScheduleDto {
  @IsIn(PROGRAMS)
  program: 'PAA' | 'EXANI' | 'PIENSE';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  courseKey?: string;

  /** Días a recorrer; múltiplos de 7 mantienen el día de la semana. */
  @IsInt()
  @Min(-730)
  @Max(730)
  days: number;
}

export class CreateSupplyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  available?: number;
}

export class UpdateSupplyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  minStock?: number | null;
}

export class CreateSupplyMovementDto {
  @IsIn(['entry', 'delivery', 'exit', 'adjust'])
  type: 'entry' | 'delivery' | 'exit' | 'adjust';

  /** Piezas que entran o salen; en un conteo físico, las piezas que hay. */
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  quantity: number;

  @Matches(DATE)
  movementDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  detail?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  unitCost?: number;
}
