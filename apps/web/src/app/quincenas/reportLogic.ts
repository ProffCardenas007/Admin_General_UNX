export type LabeledHours = {
  label: string;
  hours: number;
};

const cleanLabel = (label: string) => label.trim().replace(/\s+/g, " ").normalize("NFC");

export const normalizeDistributionLabel = (label: string) =>
  cleanLabel(label).toLocaleLowerCase("es-MX");

const isAllUppercase = (label: string) =>
  label === label.toLocaleUpperCase("es-MX") &&
  label !== label.toLocaleLowerCase("es-MX");

export const groupHoursByLabel = (rows: LabeledHours[]) => {
  const grouped = new Map<string, LabeledHours>();

  rows.forEach((row) => {
    const label = cleanLabel(row.label);
    const key = normalizeDistributionLabel(label);
    const hours = Number.isFinite(row.hours) ? row.hours : 0;
    const current = grouped.get(key);

    if (!current) {
      grouped.set(key, { label, hours });
      return;
    }

    current.hours += hours;
    if (isAllUppercase(current.label) && !isAllUppercase(label)) {
      current.label = label;
    }
  });

  return [...grouped.values()].sort((first, second) => second.hours - first.hours);
};

// ---------------------------------------------------------------------------
// Distribución de trabajo para el reporte quincenal de gastos.
// Cada renglón es Tipo (Clases | Tareas) + Programa (PAA, EXANI-II…) + Materia.
// ---------------------------------------------------------------------------

export type WorkKind = "Clases" | "Tareas";

export type WorkEntry = {
  kind: WorkKind;
  program: string;
  subject: string;
  hours: number;
  /** Clases impartidas o tareas registradas que aportan al renglón. */
  count: number;
};

export type WorkDistributionRow = WorkEntry & {
  pctOfTotal: number;
  pctOfKind: number;
};

export type AreaRow = {
  program: string;
  subject: string;
  classHours: number;
  taskHours: number;
  hours: number;
  pctOfTotal: number;
};

export type WorkDistribution = {
  rows: WorkDistributionRow[];
  areas: AreaRow[];
  totalHours: number;
  classHours: number;
  taskHours: number;
};

/** Clave tolerante a mayúsculas, espacios y acentos ("Matemáticas" = "MATEMATICAS"). */
export const areaKey = (program: string, subject: string) =>
  `${program}|${subject}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es-MX");

const pick = (current: string, candidate: string) =>
  isAllUppercase(current) && !isAllUppercase(candidate) ? candidate : current;

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

export const buildWorkDistribution = (entries: WorkEntry[]): WorkDistribution => {
  const byRow = new Map<string, WorkEntry>();

  entries.forEach((entry) => {
    const hours = Number.isFinite(entry.hours) ? Math.max(0, entry.hours) : 0;
    const program = cleanLabel(entry.program) || "Sin programa";
    const subject = cleanLabel(entry.subject) || "Sin materia";
    const key = `${entry.kind}|${areaKey(program, subject)}`;
    const current = byRow.get(key);

    if (!current) {
      byRow.set(key, { kind: entry.kind, program, subject, hours, count: entry.count });
      return;
    }

    current.hours += hours;
    current.count += entry.count;
    current.program = pick(current.program, program);
    current.subject = pick(current.subject, subject);
  });

  const merged = [...byRow.values()];
  const classHours = merged.filter((row) => row.kind === "Clases").reduce((sum, row) => sum + row.hours, 0);
  const taskHours = merged.filter((row) => row.kind === "Tareas").reduce((sum, row) => sum + row.hours, 0);
  const totalHours = classHours + taskHours;

  const areasByKey = new Map<string, AreaRow>();
  merged.forEach((row) => {
    const key = areaKey(row.program, row.subject);
    const area = areasByKey.get(key) ?? {
      program: row.program,
      subject: row.subject,
      classHours: 0,
      taskHours: 0,
      hours: 0,
      pctOfTotal: 0,
    };
    if (row.kind === "Clases") area.classHours += row.hours;
    else area.taskHours += row.hours;
    area.hours += row.hours;
    area.program = pick(area.program, row.program);
    area.subject = pick(area.subject, row.subject);
    areasByKey.set(key, area);
  });

  const areas = [...areasByKey.values()]
    .map((area) => ({ ...area, pctOfTotal: pct(area.hours, totalHours) }))
    .sort(
      (first, second) =>
        second.hours - first.hours ||
        `${first.program} ${first.subject}`.localeCompare(`${second.program} ${second.subject}`, "es"),
    );

  const areaOrder = new Map(areas.map((area, index) => [areaKey(area.program, area.subject), index]));

  // Agrupa visualmente: cada área (p. ej. PAA Matemáticas) muestra Clases y después Tareas.
  const rows = merged
    .map((row) => ({
      ...row,
      pctOfTotal: pct(row.hours, totalHours),
      pctOfKind: pct(row.hours, row.kind === "Clases" ? classHours : taskHours),
    }))
    .sort(
      (first, second) =>
        (areaOrder.get(areaKey(first.program, first.subject)) ?? 0) -
          (areaOrder.get(areaKey(second.program, second.subject)) ?? 0) ||
        (first.kind === second.kind ? 0 : first.kind === "Clases" ? -1 : 1),
    );

  return { rows, areas, totalHours, classHours, taskHours };
};

/** Fecha (YYYY-MM-DD) con la que una tarea cae en una quincena: su vencimiento o, si no tiene, su alta. */
export const taskPeriodDateKey = (task: { dueDate?: string | null; createdAt?: string | null }) => {
  const source = task.dueDate || task.createdAt;
  if (!source) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(source.slice(0, 10)) && source.length <= 10) return source;
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return null;
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
};

export const isTaskInPeriod = (
  task: { dueDate?: string | null; createdAt?: string | null },
  range: { startKey: string; endKey: string },
) => {
  const key = taskPeriodDateKey(task);
  return key !== null && key >= range.startKey && key <= range.endKey;
};

type ReportTask = {
  estimatedHours?: string | number | null;
  activeSeconds?: number | null;
  timerStartedAt?: string | null;
};

/** Segundos del cronómetro: lo acumulado más el tramo en curso, si está corriendo. */
const timerSecondsFor = (task: ReportTask, nowMs: number) =>
  (task.activeSeconds ?? 0) +
  (task.timerStartedAt
    ? Math.max(0, Math.round((nowMs - new Date(task.timerStartedAt).getTime()) / 1000))
    : 0);

/**
 * Horas de una tarea para el reporte de gerencia (solo este reporte):
 * si ya se usó el cronómetro cuentan sus horas; si sigue en 0 (tareas previas al
 * cronómetro), cuentan las horas estimadas.
 */
export const reportTaskHours = (task: ReportTask, nowMs: number) => {
  const timerSeconds = timerSecondsFor(task, nowMs);
  if (timerSeconds > 0) {
    return { hours: timerSeconds / 3600, source: "timer" as const };
  }
  const estimated = Number(task.estimatedHours ?? 0);
  return { hours: Number.isFinite(estimated) ? estimated : 0, source: "estimate" as const };
};
