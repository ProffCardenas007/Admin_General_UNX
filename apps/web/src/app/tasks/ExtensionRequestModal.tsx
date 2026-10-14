"use client";

import { useState } from "react";
import axios from "axios";
import { API_URL, authHeaders } from "../../lib/api";
import { authorizedHoursFor } from "./timer";
import type { TaskRow } from "./types";

/** Lets the assignee ask management for more hours on a task that went over its limit. */
export default function ExtensionRequestModal({
  task,
  onClose,
  onSent,
}: {
  task: TaskRow;
  onClose: () => void;
  onSent: () => void;
}) {
  const [extensionHours, setExtensionHours] = useState("1");
  const [extensionReason, setExtensionReason] = useState("");
  const [extensionSaving, setExtensionSaving] = useState(false);
  const [extensionError, setExtensionError] = useState("");

  const submit = async () => {
    const requestedHours = Number(extensionHours);
    if (!(requestedHours >= 0.25)) {
      setExtensionError("Indica al menos 0.25 horas.");
      return;
    }
    if (extensionReason.trim().length < 3) {
      setExtensionError("Explica brevemente por qué necesitas más tiempo.");
      return;
    }

    setExtensionSaving(true);
    setExtensionError("");
    try {
      await axios.post(
        `${API_URL}/time-extension-requests`,
        { taskId: task.id, requestedHours, reason: extensionReason.trim() },
        { headers: authHeaders() },
      );
      onSent();
    } catch (requestError) {
      const backendMessage = axios.isAxiosError(requestError)
        ? (requestError.response?.data as { message?: string | string[] } | undefined)?.message
        : undefined;
      setExtensionError(
        (Array.isArray(backendMessage) ? backendMessage.join(", ") : backendMessage) ||
          "No se pudo enviar la solicitud.",
      );
    } finally {
      setExtensionSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 px-4 py-6">
            <div className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-white p-5 shadow-2xl">
              <h3 className="text-lg font-semibold">Solicitar horas adicionales</h3>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                {task.code} · {task.title}
              </p>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">
                Autorizadas hoy:{" "}
                {authorizedHoursFor(task).toFixed(2)} h.
                Gerencia decide cuántas aprobar.
              </p>
              <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                Horas que necesitas
                <input
                  type="number"
                  min="0.25"
                  step="0.25"
                  value={extensionHours}
                  onChange={(event) => setExtensionHours(event.target.value)}
                  className="ui-control mt-1 w-full"
                />
              </label>
              <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                Motivo
                <textarea
                  value={extensionReason}
                  onChange={(event) => setExtensionReason(event.target.value)}
                  rows={3}
                  placeholder="Ej. El cliente pidió dos rondas más de correcciones"
                  className="ui-control mt-1 w-full"
                />
              </label>
              {extensionError ? (
                <p className="mt-3 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
                  {extensionError}
                </p>
              ) : null}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => onClose()}
                  disabled={extensionSaving}
                  className="ui-btn ui-btn-secondary ui-btn-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={extensionSaving}
                  className="ui-btn ui-btn-primary ui-btn-sm disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {extensionSaving ? "Enviando..." : "Enviar a gerencia"}
                </button>
              </div>
            </div>
          </div>
  );
}
