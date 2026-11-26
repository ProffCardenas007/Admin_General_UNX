import type {
  CourseSummary,
  Disposition,
  KitItem,
  MaterialGroup,
  MaterialItem,
  MovementType,
  Program,
  Supply,
  SupplyMovement,
} from "./types";

/**
 * Estado de un material frente a la demanda proyectada.
 *  - no_usar:      marcado como obsoleto, no entra en la proyección.
 *  - sin_grupos:   ningún grupo lo recibe.
 *  - cubierto:     inventario + impresión alcanza para todos los grupos.
 *  - insuficiente: ya hay pedido de impresión pero todavía no alcanza.
 *  - sin_pedido:   falta material y no hay cantidad a imprimir.
 */
export type MaterialStatus = "no_usar" | "sin_grupos" | "cubierto" | "insuficiente" | "sin_pedido";

export type ItemMetrics = {
  /** Alumnos proyectados que recibirán el material (solo grupos que cuentan). */
  required: number;
  /** Inscritos reales de esos grupos; null = ningún grupo tiene captura. */
  enrolled: number | null;
  /** Inventario menos inscritos: lo que queda libre hoy. null sin captura. */
  freeToday: number | null;
  /** Algún grupo ya tiene más inscritos que su proyección. */
  overEnrolled: boolean;
  /** Piezas a contemplar: por grupo, el mayor entre proyectados e inscritos. */
  demand: number;
  /** Piezas que falta mandar a imprimir. */
  toOrder: number;
  /** Inventario menos demanda. Negativo = faltan piezas. */
  balance: number;
  /** Balance más lo que se mandó a imprimir. */
  projected: number;
  status: MaterialStatus;
};

export function computeItemMetrics(
  item: Pick<MaterialItem, "available" | "printQty" | "groupIds" | "doNotUse">,
  groupsById: Map<string, Pick<MaterialGroup, "students" | "enrolled" | "counts">>,
): ItemMetrics {
  let required = 0;
  let demand = 0;
  let enrolled: number | null = null;
  let overEnrolled = false;
  for (const groupId of item.groupIds) {
    const group = groupsById.get(groupId);
    if (!group?.counts) continue;
    required += group.students;
    demand += Math.max(group.students, group.enrolled ?? 0);
    if (group.enrolled !== null) {
      enrolled = (enrolled ?? 0) + group.enrolled;
      if (group.enrolled > group.students) overEnrolled = true;
    }
  }
  const freeToday = enrolled === null ? null : (item.available ?? 0) - enrolled;
  const balance = (item.available ?? 0) - demand;
  const projected = balance + (item.printQty ?? 0);

  let status: MaterialStatus;
  if (item.doNotUse) status = "no_usar";
  else if (item.groupIds.length === 0) status = "sin_grupos";
  else if (projected >= 0) status = "cubierto";
  else if ((item.printQty ?? 0) > 0) status = "insuficiente";
  else status = "sin_pedido";

  const toOrder = item.doNotUse ? 0 : Math.max(0, -projected);

  return { required, enrolled, freeToday, overEnrolled, demand, toOrder, balance, projected, status };
}

export const STATUS_LABELS: Record<MaterialStatus, string> = {
  cubierto: "Cubierto",
  insuficiente: "Pedido insuficiente",
  sin_pedido: "Falta pedido",
  sin_grupos: "Sin grupos",
  no_usar: "No usar",
};

export function courseSummaries(groups: MaterialGroup[]): CourseSummary[] {
  const byKey = new Map<string, CourseSummary>();
  for (const group of [...groups].sort((a, b) => a.position - b.position)) {
    const entry = byKey.get(group.courseKey) ?? {
      key: group.courseKey,
      label: group.courseLabel,
      groups: [],
      students: 0,
    };
    entry.groups.push(group);
    if (group.counts) entry.students += group.students;
    byKey.set(group.courseKey, entry);
  }
  return [...byKey.values()];
}

/** Nombre corto y único de un grupo: "Integral · Virtual". */
export function groupName(group: Pick<MaterialGroup, "courseLabel" | "venue">) {
  return group.venue ? `${group.courseLabel} · ${group.venue}` : group.courseLabel;
}

/** Sedes permitidas. Es una lista cerrada: no se pueden inventar nombres (el API la valida igual). */
export const VENUE_OPTIONS = ["Presencial · López Cotilla", "Presencial · Medicina", "Virtual"] as const;

export type Modality = "presencial" | "virtual";

export const MODALITY_LABELS: Record<Modality, string> = { presencial: "Presencial", virtual: "Virtual" };

/** Presencial o virtual según la sede ("Presencial · Medicina", "Virtual"). Sin sede: null. */
export function groupModality(group: Pick<MaterialGroup, "venue">): Modality | null {
  const venue = (group.venue ?? "").trim().toLowerCase();
  if (venue.startsWith("presencial")) return "presencial";
  if (venue.startsWith("virtual")) return "virtual";
  return null;
}

export type ItemFilters = {
  search: string;
  kind: string;
  version: string;
  courseKey: string;
  venue: string;
  /** "faltante" junta insuficiente y sin pedido. */
  status: MaterialStatus | "faltante" | "";
  onlyUnreviewed: boolean;
  showDoNotUse: boolean;
};

export const EMPTY_FILTERS: ItemFilters = {
  search: "",
  kind: "",
  version: "",
  courseKey: "",
  venue: "",
  status: "",
  onlyUnreviewed: false,
  showDoNotUse: false,
};

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export function filterItems(
  items: MaterialItem[],
  groups: MaterialGroup[],
  filters: ItemFilters,
): MaterialItem[] {
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const query = normalize(filters.search.trim());

  return items.filter((item) => {
    if (item.doNotUse && !filters.showDoNotUse && filters.status !== "no_usar") return false;
    if (filters.kind && item.kind !== filters.kind) return false;
    if (filters.version && (item.version ?? "") !== filters.version) return false;
    if (filters.onlyUnreviewed && item.reviewed) return false;

    if (filters.courseKey || filters.venue) {
      const matches = item.groupIds.some((id) => {
        const group = groupsById.get(id);
        if (!group) return false;
        if (filters.courseKey && group.courseKey !== filters.courseKey) return false;
        if (filters.venue && (group.venue ?? "") !== filters.venue) return false;
        return true;
      });
      if (!matches) return false;
    }

    if (filters.status) {
      const { status } = computeItemMetrics(item, groupsById);
      const matches =
        filters.status === "faltante" ? status === "sin_pedido" || status === "insuficiente" : status === filters.status;
      if (!matches) return false;
    }

    if (query) {
      const haystack = normalize(
        [item.kind, item.version, item.module, item.notes].filter(Boolean).join(" "),
      );
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export type ItemTotals = {
  items: number;
  needAttention: number;
  toPrint: number;
  reviewed: number;
  shortage: number;
  /** Materiales que ya no alcanzan para los inscritos actuales. */
  shortToday: number;
};

export function summarize(items: MaterialItem[], groups: MaterialGroup[]): ItemTotals {
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const totals: ItemTotals = { items: 0, needAttention: 0, toPrint: 0, reviewed: 0, shortage: 0, shortToday: 0 };
  for (const item of items) {
    if (item.doNotUse) continue;
    const metrics = computeItemMetrics(item, groupsById);
    totals.items += 1;
    totals.toPrint += item.printQty ?? 0;
    if (item.reviewed) totals.reviewed += 1;
    if ((metrics.freeToday ?? 0) < 0) totals.shortToday += 1;
    if (metrics.status === "sin_pedido" || metrics.status === "insuficiente") {
      totals.needAttention += 1;
      totals.shortage += Math.abs(metrics.projected);
    }
  }
  return totals;
}

export function uniqueSorted(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) =>
    a.localeCompare(b, "es", { numeric: true }),
  );
}

/** Ordena versiones/módulos con números naturales: "2" antes de "10". */
export function compareNatural(a: string | null, b: string | null) {
  return (a ?? "").localeCompare(b ?? "", "es", { numeric: true });
}

export function formatDateShort(iso: string | null) {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${day} ${months[month - 1]} ${String(year).slice(2)}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseIso(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function toIso(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Domingo de la semana a la que pertenece la fecha (el Excel alinea así sus bloques). */
export function weekBucket(iso: string) {
  const ms = parseIso(iso);
  return toIso(ms - new Date(ms).getUTCDay() * DAY_MS);
}

/** Hoy en la zona horaria del usuario, como AAAA-MM-DD (toISOString usaría UTC y puede adelantar el día). */
export function localToday(now: Date = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export type StartTone = "none" | "upcoming" | "today" | "started";

/** Texto y tono para "cuándo empieza" un curso, respecto a `today`. */
export function describeStart(startDate: string | null | undefined, today: string): { text: string; tone: StartTone } {
  if (!startDate) return { text: "Sin fecha de inicio", tone: "none" };
  const diff = daysBetween(today, startDate);
  if (diff > 1) return { text: `Empieza en ${diff} días`, tone: "upcoming" };
  if (diff === 1) return { text: "Empieza mañana", tone: "upcoming" };
  if (diff === 0) return { text: "Empieza hoy", tone: "today" };
  if (diff === -1) return { text: "Empezó ayer", tone: "started" };
  return { text: `Inició hace ${-diff} días`, tone: "started" };
}

/** "lun 30 nov 2026". */
export function formatDateLong(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  const weekdays = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const weekday = weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday} ${day} ${months[month - 1]} ${year}`;
}

/** "Semana 3 de 15" a partir de las fechas reales del calendario (así sigue bien al agregar o quitar semanas). */
export function weekPosition(date: string, first: string, last: string) {
  const index = Math.round(daysBetween(first, date) / 7) + 1;
  const total = Math.round(daysBetween(first, last) / 7) + 1;
  return { index, total: Math.max(total, index) };
}

/** Suma (o resta) días a una fecha ISO. */
export function addDays(iso: string, days: number) {
  return toIso(parseIso(iso) + days * DAY_MS);
}

/** Días entre dos fechas ISO (b - a). */
export function daysBetween(a: string, b: string) {
  return Math.round((parseIso(b) - parseIso(a)) / DAY_MS);
}

// ── Importación de materiales / inventario (texto pegado desde Excel o CSV) ──

export const PROGRAMS: Program[] = ["PAA", "EXANI", "PIENSE"];

export const PROGRAM_LABELS: Record<Program, string> = { PAA: "PAA", EXANI: "EXANI II", PIENSE: "PIENSE II" };

export type ImportRow = {
  /** "INSUMO" manda la fila al inventario de insumos (papelería, artículos de paquete). */
  program?: Program | "INSUMO";
  kind: string;
  version?: string;
  module?: string;
  available?: number;
  printQty?: number;
  notes?: string;
  doNotUse?: boolean;
};

export type ParsedImport = {
  rows: ImportRow[];
  /** Renglones descartados, con el motivo (número de línea del texto). */
  errors: Array<{ line: number; message: string }>;
};

const COLUMN_ALIASES: Record<keyof ImportRow, string[]> = {
  program: ["programa", "prog"],
  notes: ["nota", "notas", "comentario"],
  doNotUse: ["no usar", "nousar", "obsoleto"],
  kind: ["material", "tipo", "nombre"],
  version: ["version", "versión", "v"],
  module: ["modulo", "módulo", "mod", "tema"],
  available: ["disponible", "inventario", "existencia", "stock", "cantidad"],
  printQty: ["imprimir", "a imprimir", "impresion", "impresión", "pedido"],
};

const DEFAULT_COLUMNS: Array<keyof ImportRow> = ["kind", "version", "module", "available", "printQty"];

function detectDelimiter(line: string) {
  if (line.includes("\t")) return "\t";
  if (line.includes(";")) return ";";
  return ",";
}

/** Divide un renglón respetando comillas ("a, b"). */
function splitLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current);
      current = "";
    } else current += char;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parseCount(raw: string): number | null | "invalid" {
  const clean = raw.replace(/[\s,]/g, "");
  if (clean === "" || clean === "-" || clean === "—") return null;
  const value = Number(clean);
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000) return "invalid";
  return Math.round(value);
}

/**
 * Lee texto pegado (tabulado, ; o ,). Si el primer renglón trae encabezados
 * (Material, Versión, Módulo, Disponible, A imprimir…) se usan para ubicar las
 * columnas, en cualquier orden; si no, se asume ese mismo orden.
 */
export function parseImportText(text: string): ParsedImport {
  const lines = text.split(/\r?\n/);
  const result: ParsedImport = { rows: [], errors: [] };
  let columns = DEFAULT_COLUMNS;
  let started = false;

  lines.forEach((rawLine, index) => {
    if (!rawLine.trim()) return;
    const cells = splitLine(rawLine, detectDelimiter(rawLine));

    if (!started) {
      started = true;
      const mapped = cells.map((cell) => {
        const name = normalize(cell);
        return (Object.keys(COLUMN_ALIASES) as Array<keyof ImportRow>).find((key) =>
          COLUMN_ALIASES[key].some((alias) => normalize(alias) === name),
        );
      });
      if (mapped.includes("kind")) {
        columns = mapped.map((key) => key ?? ("ignore" as never));
        return; // era la fila de encabezados
      }
    }

    const row: ImportRow = { kind: "" };
    let invalid = "";
    columns.forEach((key, position) => {
      const cell = cells[position] ?? "";
      if ((key as string) === "ignore") return;
      // "No usar" y "Nota" explícitas: vacío significa quitar la marca / la nota.
      if (key === "doNotUse") {
        row.doNotUse = ["si", "sí", "s", "x", "1", "true", "yes"].includes(cell.trim().toLowerCase());
        return;
      }
      if (key === "notes") {
        row.notes = cell;
        return;
      }
      if (!cell) return;
      if (key === "program") {
        const value = normalize(cell).replace(/[^a-z]/g, "");
        if (value.startsWith("paa")) row.program = "PAA";
        else if (value.startsWith("exani")) row.program = "EXANI";
        else if (value.startsWith("piense")) row.program = "PIENSE";
        else if (value.startsWith("insumo")) row.program = "INSUMO";
        else invalid = `Programa “${cell}” no válido (usa PAA, EXANI, PIENSE o Insumo)`;
        return;
      }
      if (key === "available" || key === "printQty") {
        const count = parseCount(cell);
        if (count === "invalid") invalid = `“${cell}” no es una cantidad válida`;
        else if (count !== null) row[key] = count;
      } else row[key] = cell;
    });

    if (!row.kind) result.errors.push({ line: index + 1, message: "Falta el nombre del material" });
    else if (invalid) result.errors.push({ line: index + 1, message: invalid });
    else result.rows.push(row);
  });
  return result;
}

const importKey = (program: string, kind: string, version?: string | null, module?: string | null) =>
  [program, kind, version ?? "", module ?? ""].map((part) => normalize(part.trim())).join("|");

export type ImportPreviewRow = ImportRow & {
  program: Program | "INSUMO";
  action: "create" | "update" | "same";
  /** Disponible resultante (para mostrar el antes → después). */
  before: number | null;
  after: number | null;
};

/** Qué pasaría con cada renglón: crear material, actualizar el existente o nada. */
export function previewImport(
  rows: ImportRow[],
  items: Array<Pick<MaterialItem, "program" | "kind" | "version" | "module" | "available" | "printQty" | "notes" | "doNotUse">>,
  mode: "replace" | "add",
  defaultProgram: Program = "PAA",
  supplies: Array<Pick<Supply, "name" | "available">> = [],
): ImportPreviewRow[] {
  const supplyByName = new Map(supplies.map((supply) => [normalize(supply.name.trim()), { ...supply }]));
  const byKey = new Map(items.map((item) => [importKey(item.program, item.kind, item.version, item.module), { ...item }]));
  return rows.map((row) => {
    const program = row.program ?? defaultProgram;
    if (program === "INSUMO") {
      const name = normalize(row.kind.trim());
      const supply = supplyByName.get(name);
      if (!supply) {
        supplyByName.set(name, { name: row.kind, available: row.available ?? null });
        return { ...row, program, action: "create", before: null, after: row.available ?? null };
      }
      const before = supply.available;
      const after = row.available === undefined ? before : mode === "add" ? (before ?? 0) + row.available : row.available;
      supply.available = after;
      return { ...row, program, action: after === before ? "same" : "update", before, after };
    }
    const key = importKey(program, row.kind, row.version, row.module);
    const match = byKey.get(key);
    if (!match) {
      byKey.set(key, {
        program,
        kind: row.kind,
        version: row.version ?? null,
        module: row.module ?? null,
        available: row.available ?? null,
        printQty: row.printQty ?? null,
        notes: row.notes || null,
        doNotUse: row.doNotUse ?? false,
      });
      return { ...row, program, action: "create", before: null, after: row.available ?? null };
    }
    const before = match.available;
    const after = row.available === undefined ? before : mode === "add" ? (before ?? 0) + row.available : row.available;
    const printChanged = row.printQty !== undefined && row.printQty !== match.printQty;
    const notesChanged = row.notes !== undefined && (row.notes || null) !== (match.notes ?? null);
    const flagChanged = row.doNotUse !== undefined && row.doNotUse !== match.doNotUse;
    match.available = after;
    if (row.printQty !== undefined) match.printQty = row.printQty;
    if (row.notes !== undefined) match.notes = row.notes || null;
    if (row.doNotUse !== undefined) match.doNotUse = row.doNotUse;
    const changed = after !== before || printChanged || notesChanged || flagChanged;
    return { ...row, program, action: changed ? "update" : "same", before, after };
  });
}


// ── Insumos: demanda de los paquetes contra las existencias ──

export type SupplyUsage = {
  program: Program;
  courseKey: string;
  courseLabel: string;
  item: string;
  perStudent: number;
  students: number;
  total: number;
};

export type SupplyStatus = "sin_uso" | "sin_dato" | "cubierto" | "insuficiente";

export const SUPPLY_STATUS_LABELS: Record<SupplyStatus, string> = {
  sin_uso: "Sin paquete vinculado",
  sin_dato: "Falta capturar existencias",
  cubierto: "Cubierto",
  insuficiente: "Insuficiente",
};

export type SupplyMetrics = {
  required: number;
  balance: number | null;
  status: SupplyStatus;
  usage: SupplyUsage[];
};

/**
 * Cuánto necesita cada insumo: por cada renglón de paquete vinculado, piezas por alumno
 * por los alumnos del curso (solo grupos que cuentan en la proyección).
 */
export function computeSupplyMetrics(
  supplies: Array<Pick<Supply, "id" | "available">>,
  kits: Array<Pick<KitItem, "program" | "courseKey" | "item" | "qty" | "supplyId">>,
  groups: Array<Pick<MaterialGroup, "program" | "courseKey" | "courseLabel" | "students" | "counts">>,
): Map<string, SupplyMetrics> {
  const courses = new Map<string, { label: string; students: number }>();
  for (const group of groups) {
    const key = `${group.program}|${group.courseKey}`;
    const entry = courses.get(key) ?? { label: group.courseLabel, students: 0 };
    if (group.counts) entry.students += group.students;
    courses.set(key, entry);
  }

  const result = new Map<string, SupplyMetrics>();
  for (const supply of supplies) {
    const usage: SupplyUsage[] = [];
    for (const kit of kits) {
      if (kit.supplyId !== supply.id || kit.qty <= 0) continue;
      const course = courses.get(`${kit.program}|${kit.courseKey}`);
      if (!course) continue;
      usage.push({
        program: kit.program,
        courseKey: kit.courseKey,
        courseLabel: course.label,
        item: kit.item,
        perStudent: kit.qty,
        students: course.students,
        total: kit.qty * course.students,
      });
    }
    const required = usage.reduce((sum, row) => sum + row.total, 0);
    const linked = kits.some((kit) => kit.supplyId === supply.id);
    const balance = supply.available === null ? null : supply.available - required;
    let status: SupplyStatus;
    if (!linked) status = "sin_uso";
    else if (supply.available === null) status = "sin_dato";
    else status = (balance ?? 0) >= 0 ? "cubierto" : "insuficiente";
    result.set(supply.id, { required, balance, status, usage });
  }
  return result;
}

// ── Control de compras y salidas ──

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  entry: "Entrada",
  delivery: "Entrega a cursos",
  exit: "Otra salida",
  adjust: "Conteo físico",
};

export type SupplyControlStatus = "comprar" | "sin_dato" | "cubierto" | "sin_uso";

export type SupplyControl = {
  entries: number;
  /** Todo lo que salió: entregas a cursos más otras salidas. */
  exits: number;
  delivered: number;
  /** Lo que piden los paquetes y todavía no se entrega. */
  pending: number;
  toBuy: number;
  status: SupplyControlStatus;
  /** Costo unitario de la compra más reciente que lo traiga. */
  lastCost: number | null;
};

/**
 * Cuánto falta comprar: lo pendiente de entregar más el mínimo, menos lo que hay.
 * `since` (AAAA-MM-DD) limita entradas, salidas y entregas al ciclo actual.
 */
export function computeSupplyControl(
  supply: Pick<Supply, "id" | "available" | "minStock">,
  required: number,
  linked: boolean,
  movements: Array<Pick<SupplyMovement, "supplyId" | "type" | "quantity" | "movementDate" | "unitCost" | "createdAt">>,
  since = "",
): SupplyControl {
  let entries = 0;
  let exits = 0;
  let delivered = 0;
  let last: { when: string; cost: number } | null = null;

  for (const movement of movements) {
    if (movement.supplyId !== supply.id) continue;
    if (movement.type === "entry" && movement.unitCost !== null) {
      const when = `${movement.movementDate}|${movement.createdAt}`;
      if (!last || when > last.when) last = { when, cost: movement.unitCost };
    }
    if (since && movement.movementDate < since) continue;
    if (movement.type === "entry") entries += movement.quantity;
    if (movement.type === "exit" || movement.type === "delivery") exits += movement.quantity;
    if (movement.type === "delivery") delivered += movement.quantity;
  }

  const pending = Math.max(0, required - delivered);
  const minimum = supply.minStock ?? 0;
  const toBuy = supply.available === null ? 0 : Math.max(0, pending + minimum - supply.available);

  let status: SupplyControlStatus;
  if (!linked && !minimum) status = "sin_uso";
  else if (supply.available === null) status = "sin_dato";
  else status = toBuy > 0 ? "comprar" : "cubierto";

  return { entries, exits, delivered, pending, toBuy, status, lastCost: last?.cost ?? null };
}

// ── Material retirado ──

export const DISPOSITIONS: Disposition[] = ["conservar", "reutilizar", "donar", "reciclar"];

export const DISPOSITION_LABELS: Record<Disposition, string> = {
  conservar: "Conservar",
  reutilizar: "Reutilizar",
  donar: "Donar",
  reciclar: "Reciclar",
};

export type DispositionFilter = "" | "pendiente" | Disposition;

export type RetiredTotals = { items: number; pieces: number; pending: number; pendingPieces: number };

/** Resumen del material retirado (los que tienen la marca "No usar"). */
export function summarizeRetired(items: Array<Pick<MaterialItem, "doNotUse" | "available" | "disposition">>): RetiredTotals {
  const totals: RetiredTotals = { items: 0, pieces: 0, pending: 0, pendingPieces: 0 };
  for (const item of items) {
    if (!item.doNotUse) continue;
    totals.items += 1;
    totals.pieces += item.available ?? 0;
    if (!item.disposition) {
      totals.pending += 1;
      totals.pendingPieces += item.available ?? 0;
    }
  }
  return totals;
}
