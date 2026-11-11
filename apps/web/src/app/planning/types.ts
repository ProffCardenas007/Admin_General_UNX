export type CellStatus = "unassigned" | "assigned" | "in_progress" | "done" | "blocked";
export type LinkedTaskStatus = "todo" | "doing" | "paused" | "blocked" | "done";

export type PlanProgress = {
  total: number;
  unassigned: number;
  assigned: number;
  inProgress: number;
  done: number;
  blocked: number;
  percent: number;
};

export type PlanSummary = {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
  progress: PlanProgress;
};

export type PlanCell = {
  id: string;
  rowId: string;
  columnId: string | null;
  status: CellStatus;
  startDate: string | null;
  endDate: string | null;
  suggestedAssignee: string | null;
  note: string | null;
  taskId: string | null;
  taskStatus?: LinkedTaskStatus;
  taskDueDate?: string | null;
  taskCompletionOutcome?: "completed" | "not_completed" | null;
  columnSpan: number;
};

export type PlanRow = { id: string; label: string; position: number; cells: PlanCell[] };

export type PlanSection = {
  id: string;
  title: string;
  spansAll: boolean;
  position: number;
  rows: PlanRow[];
};

export type PlanColumn = { id: string; label: string; position: number };

export type PlanDetail = PlanSummary & {
  ownerId: string;
  projectId: string | null;
  columns: PlanColumn[];
  sections: PlanSection[];
};

export const STATUS_ORDER: CellStatus[] = ["unassigned", "assigned", "in_progress", "done", "blocked"];

export const STATUS_LABELS: Record<CellStatus, string> = {
  unassigned: "Por asignar",
  assigned: "Asignada",
  in_progress: "En curso",
  done: "Finalizada",
  blocked: "Bloqueada",
};

// Fondo de celda y color de punto por estado.
export const STATUS_STYLES: Record<CellStatus, { cell: string; dot: string }> = {
  unassigned: { cell: "bg-white hover:bg-slate-50", dot: "bg-slate-300" },
  assigned: { cell: "bg-sky-100 hover:bg-sky-200", dot: "bg-sky-500" },
  in_progress: { cell: "bg-amber-100 hover:bg-amber-200", dot: "bg-amber-500" },
  done: { cell: "bg-emerald-100 hover:bg-emerald-200", dot: "bg-emerald-500" },
  blocked: { cell: "bg-red-100 hover:bg-red-200", dot: "bg-red-500" },
};

export function sectionProgress(section: PlanSection, columnCount: number) {
  const slots = section.rows.length * (section.spansAll ? 1 : columnCount);
  const done = section.rows.reduce(
    (sum, row) => sum + row.cells.filter((c) => c.status === "done").length,
    0,
  );
  return { done, slots, percent: slots ? Math.round((done / slots) * 100) : 0 };
}

export function columnProgress(plan: PlanDetail, columnId: string) {
  let slots = 0;
  let done = 0;
  for (const section of plan.sections) {
    if (section.spansAll) continue;
    for (const row of section.rows) {
      slots += 1;
      if (row.cells.some((c) => c.columnId === columnId && c.status === "done")) done += 1;
    }
  }
  return { done, slots, percent: slots ? Math.round((done / slots) * 100) : 0 };
}
