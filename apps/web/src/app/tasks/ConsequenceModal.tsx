"use client";

import { roleLabels } from "./labels";
import type { TaskDraft, TaskRow, UserRow } from "./types";

/**
 * Hand-off form: when a task is finished, create the next ("consecuente") task
 * and assign it. Edits go to the shared draft through `onChange`.
 */
export default function ConsequenceModal({
  task,
  draft,
  enabled,
  users,
  saving,
  onChange,
  onSave,
  onClose,
}: {
  task: TaskRow;
  draft: TaskDraft;
  /** Only tasks marked as finished can hand off to a next one. */
  enabled: boolean;
  users: UserRow[];
  saving: boolean;
  onChange: (patch: Partial<TaskDraft>) => void;
  onSave: () => void;
  onClose: () => void;
}) {
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
                    Tarea consecuente
                  </p>
                  <h3 className="mt-1 text-lg font-semibold">{task.title}</h3>
                  <p className="text-xs text-[var(--ink-muted)]">{task.code}</p>
                </div>
                <button
                  onClick={() => onClose()}
                  className="ui-btn ui-btn-secondary ui-btn-sm"
                >
                  Cerrar
                </button>
              </div>
  
              {!enabled ? (
                <p className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--ink-muted)]">
                  Marca esta tarea como finalizada para habilitar la continuidad.
                </p>
              ) : null}
  
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <select
                  value={draft.handoffToUserId}
                  onChange={(event) =>
                    onChange({ handoffToUserId: event.target.value })
                  }
                  className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                  disabled={!enabled}
                >
                  <option value="">Mencionar responsable siguiente (opcional)</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.fullName} ({roleLabels[user.role] ?? user.role})
                    </option>
                  ))}
                </select>
                <select
                  value={draft.nextActivityType ?? task.activityType}
                  onChange={(event) =>
                    onChange({ nextActivityType: event.target.value as TaskRow["activityType"] })
                  }
                  className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                  disabled={!enabled}
                >
                  <option value="revision">revision</option>
                  <option value="edicion">edicion</option>
                  <option value="creacion">creacion</option>
                  <option value="presentaciones">presentaciones</option>
                  <option value="grabacion">grabacion</option>
                  <option value="plataforma">plataforma</option>
                  <option value="administrativo">administrativo</option>
                </select>
                <input
                  type="date"
                  value={draft.nextDueDate ?? task.dueDate ?? ""}
                  onChange={(event) =>
                    onChange({ nextDueDate: event.target.value })
                  }
                  className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                  disabled={!enabled}
                />
                <label className="text-xs text-[var(--ink-muted)]">
                  Horas estimadas (tarea consecuente)
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={draft.nextEstimatedHours ?? task.estimatedHours ?? ""}
                    onChange={(event) =>
                      onChange({ nextEstimatedHours: event.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                    placeholder="0"
                    disabled={!enabled}
                  />
                </label>
              </div>
  
              <div className="mt-3 space-y-3">
                <input
                  value={draft.handoffTitle}
                  onChange={(event) =>
                    onChange({ handoffTitle: event.target.value })
                  }
                  className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                  placeholder="Titulo de la tarea subsecuente"
                  disabled={!enabled}
                />
                <input
                  value={draft.handoffMessage}
                  onChange={(event) =>
                    onChange({ handoffMessage: event.target.value })
                  }
                  className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                  placeholder="Mensaje para la actividad consecuente"
                  disabled={!enabled}
                />
              </div>
  
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  onClick={() => onClose()}
                  className="ui-btn ui-btn-secondary"
                >
                  Cerrar
                </button>
                <button
                  onClick={() => onSave()}
                  disabled={saving}
                  className="ui-btn ui-btn-primary disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {saving ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </div>
          </div>
  );
}
