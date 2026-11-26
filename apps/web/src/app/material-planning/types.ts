export type Program = "PAA" | "EXANI" | "PIENSE";

/** Destino de un material retirado; null = por decidir. */
export type Disposition = "conservar" | "reutilizar" | "donar" | "reciclar";

export type MaterialGroup = {
  id: string;
  program: Program;
  courseKey: string;
  courseLabel: string;
  venue: string | null;
  /** Alumnos proyectados. */
  students: number;
  /** Inscritos reales; null = sin capturar. */
  enrolled: number | null;
  counts: boolean;
  position: number;
};

export type MaterialItem = {
  id: string;
  program: Program;
  kind: string;
  version: string | null;
  module: string | null;
  available: number | null;
  printQty: number | null;
  notes: string | null;
  doNotUse: boolean;
  disposition: Disposition | null;
  reviewed: boolean;
  position: number;
  groupIds: string[];
};

export type KitItem = {
  id: string;
  program: Program;
  courseKey: string;
  item: string;
  qty: number;
  /** Insumo del inventario con el que se compara este renglón (null = sin comparar). */
  supplyId: string | null;
  position: number;
};

/** Papelería y artículos de paquete: tienen existencias pero no son material didáctico. */
export type Supply = {
  id: string;
  name: string;
  available: number | null;
  /** Existencia de seguridad: por debajo de esto conviene comprar. */
  minStock: number | null;
  position: number;
};

/** entry = compra · delivery = entrega a cursos · exit = otra salida · adjust = conteo físico (con signo) */
export type MovementType = "entry" | "delivery" | "exit" | "adjust";

export type SupplyMovement = {
  id: string;
  supplyId: string;
  type: MovementType;
  quantity: number;
  movementDate: string;
  detail: string | null;
  unitCost: number | null;
  createdBy: string | null;
  createdAt: string;
};

export type ScheduleEntry = {
  id: string;
  program: Program;
  courseKey: string;
  weekStart: string | null;
  weekNumber: number | null;
  label: string;
  /** exam = lleva examen · none = sin examen · break = descanso · end = cierre */
  kind: "exam" | "none" | "break" | "end";
};

export type MaterialNote = { id: string; program: Program; text: string; position: number };

export type CourseStart = { program: Program; courseKey: string; startDate: string };

export type MaterialPlanningData = {
  groups: MaterialGroup[];
  items: MaterialItem[];
  kits: KitItem[];
  schedule: ScheduleEntry[];
  notes: MaterialNote[];
  courseStarts: CourseStart[];
  supplies: Supply[];
  supplyMovements: SupplyMovement[];
};

/** Un curso agrupa varias sedes (p. ej. Integral = López Cotilla + Virtual). */
export type CourseSummary = {
  key: string;
  label: string;
  groups: MaterialGroup[];
  students: number;
};
