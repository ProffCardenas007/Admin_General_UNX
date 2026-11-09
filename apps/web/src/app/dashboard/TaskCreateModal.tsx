"use client";

import { useMemo, useState } from "react";
import axios from "axios";
import { API_URL, authHeaders } from "../../lib/api";
import { specialtyLabels } from "../../lib/specialties";
import { toLocalDateKey } from "./metrics";
import {
  activityTypeOptions,
  priorityOptions,
  roleLabels,
  taskStatusOptions,
  type ProjectRow,
  type TaskRow,
  type TeamOption,
  type UserOption,
} from "./types";

/** Choices kept between openings so creating several similar tasks is quick. */
export type TaskFormDefaults = {
  activityType: TaskRow["activityType"];
  status: TaskRow["status"];
  priority: TaskRow["priority"];
  assigneeId: string;
};

export const INITIAL_TASK_DEFAULTS: TaskFormDefaults = {
  activityType: "creacion",
  status: "todo",
  priority: "medium",
  assigneeId: "",
};

export type DashboardMessage = { error?: string; info?: string };

export default function TaskCreateModal({
  projects,
  users,
  teams,
  presetProjectId,
  defaults,
  onClose,
  onCreated,
  setMessage,
}: {
  projects: ProjectRow[];
  users: UserOption[];
  teams: TeamOption[];
  presetProjectId?: string;
  defaults: TaskFormDefaults;
  onClose: () => void;
  onCreated: (tasks: TaskRow[], defaults: TaskFormDefaults) => void;
  setMessage: (message: DashboardMessage) => void;
}) {
  const [savingTask, setSavingTask] = useState(false);
  const [taskForm, setTaskForm] = useState(() => ({
    projectId: presetProjectId || projects[0]?.id || "",
    activityType: defaults.activityType,
    title: "",
    description: "",
    assigneeId: users.some((user) => user.id === defaults.assigneeId)
      ? defaults.assigneeId
      : "",
    teamId: "",
    status: defaults.status,
    priority: defaults.priority,
    dueDate: "",
    estimatedHours: "",
  }));

  const selectedTaskProject = useMemo(
    () => projects.find((project) => project.id === taskForm.projectId),
    [projects, taskForm.projectId],
  );

  const projectTaskSpecialtyLabel = (project?: ProjectRow) => {
    if (!project?.scope) {
      return "";
    }

    return specialtyLabels[project.scope];
  };

  const submit = async () => {
    setMessage({});

    if (!taskForm.dueDate) {
      setMessage({ error: "Selecciona una fecha de finalizacion para la tarea." });
      return;
    }

    setSavingTask(true);

    try {
      const payload = {
        projectId: taskForm.projectId,
        activityType: taskForm.activityType,
        title: taskForm.title,
        description: taskForm.description,
        assigneeId: taskForm.teamId ? undefined : taskForm.assigneeId || undefined,
        teamId: taskForm.teamId || undefined,
        status: taskForm.status,
        priority: taskForm.priority,
        dueDate: taskForm.dueDate,
        estimatedHours: taskForm.estimatedHours
          ? Number(taskForm.estimatedHours)
          : undefined,
      };

      const createdResponse = await axios.post(`${API_URL}/tasks`, payload, {
        headers: authHeaders(),
      });

      // Assigning to a team creates one task per member and answers { tasks: [...] }.
      const data = createdResponse.data as TaskRow | { tasks: TaskRow[] };
      const createdTasks = "tasks" in data && Array.isArray(data.tasks) ? data.tasks : [data as TaskRow];

      onCreated(createdTasks, {
        activityType: taskForm.activityType,
        status: taskForm.status,
        priority: taskForm.priority,
        assigneeId: taskForm.assigneeId,
      });
      setMessage({ info: "Tarea creada." });
      onClose();
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        const rawMessage = caughtError.response?.data?.message;
        const backendMessage =
          typeof rawMessage === "string"
            ? rawMessage
            : Array.isArray(rawMessage)
              ? rawMessage.join(". ")
              : "";

        setMessage({
          error: backendMessage
            ? `No se pudo crear la tarea: ${backendMessage}`
            : "No se pudo crear la tarea. Verifica proyecto, actividad, titulo y descripcion.",
        });
      } else {
        setMessage({
          error: "No se pudo crear la tarea. Verifica proyecto, actividad, titulo y descripcion.",
        });
      }
    } finally {
      setSavingTask(false);
    }
  };

  return (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4"
          onClick={() => onClose()}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-[var(--line)] bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                  Captura
                </p>
                <h3 className="mt-1 text-lg font-semibold">Crear tarea</h3>
              </div>
              <button
                onClick={() => onClose()}
                className="ui-btn ui-btn-secondary ui-btn-sm"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <select
                name="task-modal-project"
                className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
                value={taskForm.projectId}
                onChange={(event) => setTaskForm({ ...taskForm, projectId: event.target.value })}
              >
                <option value="">Nombre del proyecto</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>

              <div className="grid gap-3 md:grid-cols-2">
                <input
                  name="task-modal-academia"
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-sm"
                  placeholder="Academia"
                  value={selectedTaskProject?.code ?? ""}
                  readOnly
                />
                <input
                  name="task-modal-especialidad"
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-sm"
                  placeholder="Especialidad"
                  value={projectTaskSpecialtyLabel(selectedTaskProject)}
                  readOnly
                />
              </div>

              <select
                name="task-modal-activity"
                className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
                value={taskForm.activityType}
                onChange={(event) =>
                  setTaskForm({ ...taskForm, activityType: event.target.value as TaskRow["activityType"] })
                }
              >
                {activityTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <input
                name="task-modal-title"
                className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
                placeholder="Titulo"
                value={taskForm.title}
                onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })}
              />

              <textarea
                name="task-modal-description"
                className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
                placeholder="Descripcion"
                value={taskForm.description}
                onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })}
                rows={4}
              />

              <select
                name="task-modal-assignee"
                className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
                value={taskForm.assigneeId}
                onChange={(event) => setTaskForm({ ...taskForm, assigneeId: event.target.value })}
              >
                <option value="">Sin asignar — disponible para tomar</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName} - {roleLabels[user.role] ?? user.role}
                  </option>
                ))}
              </select>

              <select
                name="task-modal-team"
                className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
                value={taskForm.teamId}
                onChange={(event) =>
                  setTaskForm((current) => ({
                    ...current,
                    teamId: event.target.value,
                    assigneeId: event.target.value ? "" : current.assigneeId,
                  }))
                }
              >
                <option value="">Asignar por equipo (opcional)</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} ({team.memberCount ?? 0})
                  </option>
                ))}
              </select>

              <div className="grid gap-3 md:grid-cols-2">
                <select
                  name="task-modal-status"
                  className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
                  value={taskForm.status}
                  onChange={(event) =>
                    setTaskForm({ ...taskForm, status: event.target.value as TaskRow["status"] })
                  }
                >
                  {taskStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <select
                  name="task-modal-priority"
                  className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
                  value={taskForm.priority}
                  onChange={(event) =>
                    setTaskForm({ ...taskForm, priority: event.target.value as TaskRow["priority"] })
                  }
                >
                  {priorityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <input
                  name="task-modal-due-date"
                  type="date"
                  required
                  placeholder="Fecha de finalizacion"
                  className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
                  value={taskForm.dueDate}
                  onFocus={() => {
                    if (!taskForm.dueDate) {
                      setTaskForm((current) => ({ ...current, dueDate: toLocalDateKey(new Date()) }));
                    }
                  }}
                  onChange={(event) => setTaskForm({ ...taskForm, dueDate: event.target.value })}
                />
                <input
                  name="task-modal-estimated-hours"
                  type="number"
                  min="0"
                  step="0.5"
                  className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
                  placeholder="Horas estimadas"
                  value={taskForm.estimatedHours}
                  onChange={(event) => setTaskForm({ ...taskForm, estimatedHours: event.target.value })}
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => onClose()}
                className="ui-btn ui-btn-secondary"
              >
                Cancelar
              </button>
              <button
                onClick={() => void submit()}
                disabled={savingTask}
                className="ui-btn ui-btn-primary disabled:cursor-not-allowed disabled:opacity-70"
              >
                {savingTask ? "Creando..." : "Crear tarea"}
              </button>
            </div>
          </div>
        </div>
  );
}
