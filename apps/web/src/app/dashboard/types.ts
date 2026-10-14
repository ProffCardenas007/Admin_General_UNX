import type { LeadSpecialty } from "../../lib/specialties";

export type Summary = {
  activeProjects: number;
  completionRate: number;
  overdueTasks: number;
  blockedTasks: number;
  hoursWorked: number;
};

export type WorkloadRow = {
  userId: string;
  estimatedHours?: string;
  /** Deprecated alias of estimatedHours kept by the API for older clients. */
  hoursWorked: string;
  /** Real hours: timer + manual entries, from the shared hours ledger. */
  workedHours?: string;
  activeSecondsWorked?: string;
  tasksCount: string;
};

export type ClassHoursRow = {
  userId: string;
  classHours: number;
  sessionsCount: number;
};

export type TaskRow = {
  id: string;
  createdBy?: string | null;
  projectId: string;
  activityType: "revision" | "edicion" | "creacion" | "presentaciones" | "grabacion" | "plataforma" | "administrativo";
  title: string;
  description?: string;
  assigneeId?: string;
  status: "todo" | "doing" | "paused" | "blocked" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  dueDate?: string;
  estimatedHours?: string;
  completionOutcome?: "completed" | "not_completed" | null;
};

export type ProjectRow = {
  id: string;
  code: string;
  name: string;
  scope?: LeadSpecialty | null;
  status: "planned" | "active" | "on_hold" | "done" | "cancelled";
  startDate?: string;
  endDate?: string;
};

export type UserOption = {
  id: string;
  fullName: string;
  role: "manager" | "lead" | "worker";
  isActive?: boolean;
};

export type TeamOption = {
  id: string;
  name: string;
  memberCount?: number;
};

export type ProjectProgress = {
  projectId: string;
  totalTasks: number;
  doneTasks: number;
  completionRate: number;
  overdueTasks: number;
};

export type RiskLevel = "green" | "amber" | "red";

export type Fortnight = {
  startKey: string;
  endKey: string;
  label: string;
  businessDays: number;
  targetHours: number;
};

export const projectStatusLabels: Record<ProjectRow["status"], string> = {
  planned: "planificado",
  active: "activo",
  on_hold: "en pausa",
  done: "finalizado",
  cancelled: "cancelado",
};

export const riskLabelMap: Record<RiskLevel, string> = {
  green: "estable",
  amber: "en seguimiento",
  red: "en riesgo",
};

export const activityTypeOptions = [
  { value: "revision", label: "revision" },
  { value: "edicion", label: "edicion" },
  { value: "creacion", label: "creacion" },
  { value: "presentaciones", label: "presentaciones" },
  { value: "grabacion", label: "grabacion" },
  { value: "plataforma", label: "plataforma" },
  { value: "administrativo", label: "administrativo" },
] as const;

export const taskStatusOptions = [
  { value: "todo", label: "por hacer" },
  { value: "doing", label: "en curso" },
  { value: "blocked", label: "bloqueada" },
  { value: "done", label: "finalizada" },
] as const;

export const taskStatusLabels: Record<TaskRow["status"], string> = {
  todo: "por hacer",
  doing: "en curso",
  paused: "pausada",
  blocked: "bloqueada",
  done: "finalizada",
};

export const taskStatusLabel = (task: TaskRow) =>
  task.status === "done" && task.completionOutcome === "not_completed"
    ? "no completada"
    : taskStatusLabels[task.status] ?? task.status;

export const priorityOptions = [
  { value: "low", label: "baja" },
  { value: "medium", label: "media" },
  { value: "high", label: "alta" },
  { value: "urgent", label: "urgente" },
] as const;

export const taskPriorityLabels: Record<TaskRow["priority"], string> = {
  low: "baja",
  medium: "media",
  high: "alta",
  urgent: "urgente",
};

export const roleLabels: Record<UserOption["role"], string> = {
  manager: "gerencia",
  lead: "lider",
  worker: "colaborador",
};
