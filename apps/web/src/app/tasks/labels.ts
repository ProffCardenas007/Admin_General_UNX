// Constants and labels with no dependencies (usable from pure, testable modules).

export const UNASSIGNED_SENTINEL = "__unassigned__";

export const statusLabels: Record<string, string> = {
  todo: "por hacer",
  doing: "en curso",
  paused: "pausada",
  blocked: "bloqueada",
  done: "finalizada",
};

export const priorityLabels: Record<string, string> = {
  low: "baja",
  medium: "media",
  high: "alta",
  urgent: "urgente",
};

export const activityTypeLabels: Record<string, string> = {
  revision: "revision",
  edicion: "edicion",
  creacion: "creacion",
  presentaciones: "presentaciones",
  grabacion: "grabacion",
  plataforma: "plataforma",
  administrativo: "administrativo",
};

export const roleLabels: Record<string, string> = {
  manager: "gerencia",
  lead: "líder",
  worker: "colaborador",
};
