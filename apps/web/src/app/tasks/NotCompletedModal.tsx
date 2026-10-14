"use client";

import { useState } from "react";
import axios from "axios";
import { API_URL, authHeaders } from "../../lib/api";
import { extractErrorMessage } from "../../lib/http";
import { roleLabels } from "./labels";
import type { TaskRow, UserRow } from "./types";

/** Closes a task as "no completada", optionally handing it to someone else. */
export default function NotCompletedModal({
  task,
  users,
  assigneeLabel,
  onClose,
  onDone,
}: {
  task: TaskRow;
  users: UserRow[];
  assigneeLabel: string;
  onClose: () => void;
  onDone: (updatedTask: TaskRow, wasReassigned: boolean) => void;
}) {
  const [notCompletedReason, setNotCompletedReason] = useState("");
  const [notCompletedReassignToUserId, setNotCompletedReassignToUserId] = useState("");
  const [notCompletedError, setNotCompletedError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const reason = notCompletedReason.trim();
    if (!reason) {
      setNotCompletedError("Escribe el motivo por el que la tarea no fue completada.");
      return;
    }

    setNotCompletedError("");
    setSaving(true);

    try {
      const response = await axios.patch(
        `${API_URL}/tasks/${task.id}/not-completed`,
        {
          reason,
          reassignToUserId: notCompletedReassignToUserId || undefined,
        },
        { headers: authHeaders() },
      );

      onDone(response.data as TaskRow, Boolean(notCompletedReassignToUserId));
    } catch (caughtError) {
      setNotCompletedError(
        extractErrorMessage(caughtError, "No se pudo registrar la tarea no completada."),
      );
      setSaving(false);
    }
  };

  return (
    <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4"
            onClick={onClose}
          >
            <form
              className="w-full max-w-xl rounded-2xl border border-[var(--line)] bg-white p-5 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--danger)]">
                    Tarea no completada
                  </p>
                  <h3 className="mt-1 text-lg font-semibold">{task.title}</h3>
                  <p className="text-xs text-[var(--ink-muted)]">
                    Responsable actual: {assigneeLabel}
                  </p>
                </div>
                <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary ui-btn-sm">
                  Cerrar
                </button>
              </div>
  
              <label className="mt-5 block text-sm font-semibold text-[var(--foreground)]">
                Motivo
                <textarea
                  value={notCompletedReason}
                  onChange={(event) => setNotCompletedReason(event.target.value)}
                  rows={4}
                  maxLength={1000}
                  className="mt-2 block w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-normal"
                  placeholder="Describe qué quedó pendiente o por qué no se completó"
                  autoFocus
                />
              </label>
  
              <label className="mt-4 block text-sm font-semibold text-[var(--foreground)]">
                Reasignar a otra persona (opcional)
                <select
                  value={notCompletedReassignToUserId}
                  onChange={(event) => setNotCompletedReassignToUserId(event.target.value)}
                  className="mt-2 block w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-normal"
                >
                  <option value="">No reasignar: cerrar la tarea</option>
                  {users
                    .filter((user) => user.id !== task.assigneeId)
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.fullName} ({roleLabels[user.role] ?? user.role})
                      </option>
                    ))}
                </select>
              </label>
  
              <p className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--ink-muted)]">
                {notCompletedReassignToUserId
                  ? "Se registrará el incumplimiento del responsable actual y la tarea volverá a Por hacer con el nuevo responsable."
                  : "Se registrará el incumplimiento del responsable actual y la tarea quedará cerrada como No completada."}
              </p>
  
              {notCompletedError ? (
                <p className="mt-3 text-sm text-[var(--danger)]">{notCompletedError}</p>
              ) : null}
  
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="ui-btn ui-btn-danger disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {saving
                    ? "Registrando..."
                    : notCompletedReassignToUserId
                      ? "Registrar y reasignar"
                      : "Registrar y cerrar tarea"}
                </button>
              </div>
            </form>
          </div>
  );
}
