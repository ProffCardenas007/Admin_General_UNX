import type { LeadSpecialty } from "../../lib/specialties";

export type TaskRow = {
  id: string;
  code: string;
  parentTaskId?: string | null;
  activityType:
    | "revision"
    | "edicion"
    | "creacion"
    | "presentaciones"
    | "grabacion"
    | "plataforma"
    | "administrativo";
  title: string;
  description?: string;
  projectId: string;
  assigneeId?: string;
  createdBy?: string | null;
  status: "todo" | "doing" | "paused" | "blocked" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  dueDate?: string;
  estimatedHours: string;
  /** Extra hours approved by management on top of the original estimate. */
  authorizedExtraHours?: string;
  activeSeconds?: number;
  timerStartedAt?: string | null;
  completionOutcome?: "completed" | "not_completed" | null;
  /**
   * Tarea registrada por la propia persona: pending = espera aprobación de
   * gerencia, rejected = rechazada. null = tarea normal.
   */
  approvalStatus?: "pending" | "approved" | "rejected" | null;
  approvalNote?: string | null;
  /** Only in the response to starting a task: the person's other tasks paused to start this one. */
  pausedTasks?: TaskRow[];
};

export type TaskEditForm = {
  projectId: string;
  title: string;
  description: string;
  activityType: TaskRow["activityType"];
  assigneeId: string;
  status: TaskRow["status"];
  priority: TaskRow["priority"];
  dueDate: string;
  estimatedHours: string;
};

export type ProjectRow = {
  id: string;
  code: string;
  name: string;
  scope?: LeadSpecialty | null;
  status?: "planned" | "active" | "on_hold" | "done" | "cancelled";
};

export type UserRow = {
  id: string;
  fullName: string;
  role: string;
};

export type TaskUpdateRow = {
  id: string;
  taskId: string;
  userId: string;
  updateDate: string;
  workedHours: string;
  timerSeconds?: number;
  progressPercent: string;
  blockerReason?: string;
  comments?: string;
};

export type HalfMonth = "first" | "second";

/** Unsaved edits for one task row, plus the optional follow-up ("consecuente") task. */
export type TaskDraft = {
  status: TaskRow["status"];
  priority: TaskRow["priority"];
  assigneeId: string;
  description: string;
  dueDate: string;
  estimatedHours: string;
  handoffToUserId: string;
  handoffTitle: string;
  handoffMessage: string;
  nextActivityType: TaskRow["activityType"];
  nextDueDate: string;
  nextEstimatedHours: string;
};
