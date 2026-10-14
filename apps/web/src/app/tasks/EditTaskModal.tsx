"use client";

import { useState } from "react";
import axios from "axios";
import { API_URL, authHeaders } from "../../lib/api";
import { extractErrorMessage } from "../../lib/http";
import { activityTypeLabels, priorityLabels, roleLabels, statusLabels } from "./labels";
import type { ProjectRow, TaskEditForm, TaskRow, UserRow } from "./types";

/** Full edit form for managers and leads. Owns the form and the save request. */
export default function EditTaskModal({
  task,
  role,
  projects,
  users,
  projectLabel,
  onClose,
  onSaved,
}: {
  task: TaskRow;
  role: string;
  projects: ProjectRow[];
  users: UserRow[];
  projectLabel: (projectId: string) => string;
  onClose: () => void;
  onSaved: (updatedTask: TaskRow) => void;
}) {
  const [taskEditForm, setTaskEditForm] = useState<TaskEditForm>(() => ({
    projectId: task.projectId,
    title: task.title,
    description: task.description ?? "",
    activityType: task.activityType,
    assigneeId: task.assigneeId ?? "",
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate ?? "",
    estimatedHours: task.estimatedHours ?? "",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!taskEditForm.title.trim()) {
      setError("El título de la tarea es obligatorio.");
      return;
    }

    setError("");
    setSaving(true);

    try {
      const updated = await axios.patch(
        `${API_URL}/tasks/${task.id}`,
        {
          projectId: role === "manager" ? taskEditForm.projectId : undefined,
          title: taskEditForm.title.trim(),
          description: taskEditForm.description,
          activityType: taskEditForm.activityType,
          assigneeId: taskEditForm.assigneeId || null,
          status: taskEditForm.status,
          priority: taskEditForm.priority,
          dueDate: taskEditForm.dueDate || null,
          estimatedHours: taskEditForm.estimatedHours
            ? Number(taskEditForm.estimatedHours)
            : 0,
        },
        { headers: authHeaders() },
      );

      onSaved(updated.data as TaskRow);
    } catch (caughtError) {
      setError(extractErrorMessage(caughtError, "No se pudo actualizar la tarea."));
      setSaving(false);
    }
  };

  return (
    <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 px-4 py-6"
            onClick={() => onClose()}
          >
            <form
              className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--line)] bg-white p-5 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                    Edición de tarea
                  </p>
                  <h3 className="mt-1 text-lg font-semibold">Modificar tarea</h3>
                </div>
                <button
                  type="button"
                  onClick={() => onClose()}
                  className="ui-btn ui-btn-secondary ui-btn-sm"
                >
                  Cerrar
                </button>
              </div>
  
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="block text-xs text-[var(--ink-muted)] md:col-span-2">
                  Título
                  <input
                    value={taskEditForm.title}
                    onChange={(event) => setTaskEditForm({ ...taskEditForm, title: event.target.value })}
                    className="ui-control mt-1 block w-full"
                    autoFocus
                  />
                </label>
                {role === "manager" ? (
                  <label className="block text-xs text-[var(--ink-muted)] md:col-span-2">
                    Proyecto
                    <select
                      value={taskEditForm.projectId}
                      onChange={(event) => setTaskEditForm({ ...taskEditForm, projectId: event.target.value })}
                      className="ui-control mt-1 block w-full"
                    >
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {projectLabel(project.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="block text-xs text-[var(--ink-muted)]">
                  Actividad
                  <select
                    value={taskEditForm.activityType}
                    onChange={(event) => setTaskEditForm({ ...taskEditForm, activityType: event.target.value as TaskRow["activityType"] })}
                    className="ui-control mt-1 block w-full"
                  >
                    {Object.entries(activityTypeLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-[var(--ink-muted)]">
                  Responsable
                  <select
                    value={taskEditForm.assigneeId}
                    onChange={(event) => setTaskEditForm({ ...taskEditForm, assigneeId: event.target.value })}
                    className="ui-control mt-1 block w-full"
                  >
                    <option value="">Sin asignar</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.fullName} ({roleLabels[user.role] ?? user.role})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-[var(--ink-muted)]">
                  Estado
                  <select
                    value={taskEditForm.status}
                    onChange={(event) => setTaskEditForm({ ...taskEditForm, status: event.target.value as TaskRow["status"] })}
                    className="ui-control mt-1 block w-full"
                  >
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-[var(--ink-muted)]">
                  Prioridad
                  <select
                    value={taskEditForm.priority}
                    onChange={(event) => setTaskEditForm({ ...taskEditForm, priority: event.target.value as TaskRow["priority"] })}
                    className="ui-control mt-1 block w-full"
                  >
                    {Object.entries(priorityLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-[var(--ink-muted)]">
                  Fecha fin
                  <input
                    type="date"
                    value={taskEditForm.dueDate}
                    onChange={(event) => setTaskEditForm({ ...taskEditForm, dueDate: event.target.value })}
                    className="ui-control mt-1 block w-full"
                  />
                </label>
                <label className="block text-xs text-[var(--ink-muted)]">
                  Horas estimadas
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    value={taskEditForm.estimatedHours}
                    onChange={(event) => setTaskEditForm({ ...taskEditForm, estimatedHours: event.target.value })}
                    className="ui-control mt-1 block w-full"
                  />
                </label>
                <label className="block text-xs text-[var(--ink-muted)] md:col-span-2">
                  Descripción
                  <textarea
                    rows={4}
                    value={taskEditForm.description}
                    onChange={(event) => setTaskEditForm({ ...taskEditForm, description: event.target.value })}
                    className="ui-control mt-1 block w-full resize-y"
                  />
                </label>
              </div>
  
              {error ? <p className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}
  
              <div className="mt-5 flex justify-end gap-3">
                <button type="button" onClick={() => onClose()} className="ui-btn ui-btn-secondary">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="ui-btn ui-btn-primary disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {saving ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </form>
          </div>
  );
}
