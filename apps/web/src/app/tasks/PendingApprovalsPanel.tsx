"use client";

import axios from "axios";
import { useState } from "react";
import { API_URL, authHeaders } from "../../lib/api";
import { extractErrorMessage } from "../../lib/http";
import { activityTypeLabels } from "./labels";
import type { ProjectRow, TaskRow } from "./types";

type Props = {
  tasks: TaskRow[];
  projects: ProjectRow[];
  projectLabel: (projectId: string) => string;
  assigneeLabel: (userId?: string) => string;
  onReviewed: (task: TaskRow, decision: "approve" | "reject") => void;
};

type Draft = { activityType: TaskRow["activityType"]; projectId: string; hours: string; note: string; rejecting: boolean };

const activityOrder = Object.keys(activityTypeLabels) as TaskRow["activityType"][];

/** Gerencia: tareas que las personas registraron por su cuenta, para aprobar o rechazar. */
export default function PendingApprovalsPanel({ tasks, projects, projectLabel, assigneeLabel, onReviewed }: Props) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  if (tasks.length === 0) return null;

  const draftOf = (task: TaskRow): Draft =>
    drafts[task.id] ?? {
      activityType: task.activityType,
      projectId: task.projectId,
      hours: String(Number(task.estimatedHours)),
      note: "",
      rejecting: false,
    };
  const patch = (task: TaskRow, changes: Partial<Draft>) =>
    setDrafts((current) => ({ ...current, [task.id]: { ...draftOf(task), ...changes } }));

  const review = async (task: TaskRow, decision: "approve" | "reject") => {
    const draft = draftOf(task);
    const hours = Number(draft.hours);
    if (decision === "approve" && !(hours >= 0 && hours <= 80)) {
      setError("Las horas deben estar entre 0 y 80.");
      return;
    }
    if (decision === "reject" && !draft.note.trim()) {
      setError("Escribe el motivo del rechazo.");
      return;
    }
    setBusyId(task.id);
    setError("");
    try {
      const response = await axios.patch<TaskRow>(
        `${API_URL}/tasks/${task.id}/review`,
        decision === "approve"
          ? {
              decision,
              activityType: draft.activityType,
              projectId: draft.projectId,
              estimatedHours: hours,
              ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
            }
          : { decision, note: draft.note.trim() },
        { headers: authHeaders() },
      );
      onReviewed(response.data, decision);
    } catch (caughtError) {
      setError(extractErrorMessage(caughtError, "No se pudo revisar la tarea."));
    } finally {
      setBusyId("");
    }
  };

  return (
    <section className="glass-panel fade-up border-amber-200 p-6 md:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">
          Tareas por aprobar{" "}
          <span className="ml-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-semibold text-amber-800">{tasks.length}</span>
        </h2>
        <p className="text-sm text-[var(--ink-muted)]">
          Actividades que las personas registraron por su cuenta. No cuentan en reportes hasta que las apruebes.
        </p>
      </div>
      {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="mt-4 space-y-3">
        {tasks.map((task) => {
          const draft = draftOf(task);
          const busy = busyId === task.id;
          return (
            <article key={task.id} className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold">{task.title}</p>
                  <p className="text-xs text-[var(--ink-muted)]">
                    <span className="font-semibold text-[var(--foreground)]">{assigneeLabel(task.assigneeId)}</span> ·{" "}
                    {task.dueDate ?? "sin fecha"} · {Number(task.estimatedHours)} h solicitadas ·{" "}
                    {task.status === "done" ? "ya terminada" : "por hacer"}
                  </p>
                  {task.description ? <p className="mt-2 whitespace-pre-line text-sm">{task.description}</p> : null}
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1.4fr_7rem]">
                <label className="text-xs">
                  <span className="font-semibold">Categoría</span>
                  <select
                    value={draft.activityType}
                    onChange={(event) => patch(task, { activityType: event.target.value as TaskRow["activityType"] })}
                    className="ui-control mt-1"
                    disabled={busy}
                  >
                    {activityOrder.map((activity) => (
                      <option key={activity} value={activity}>
                        {activityTypeLabels[activity]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  <span className="font-semibold">Proyecto</span>
                  <select
                    value={draft.projectId}
                    onChange={(event) => patch(task, { projectId: event.target.value })}
                    className="ui-control mt-1"
                    disabled={busy}
                  >
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {projectLabel(project.id)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  <span className="font-semibold">Horas</span>
                  <input
                    type="number"
                    min={0}
                    max={80}
                    step={0.25}
                    value={draft.hours}
                    onChange={(event) => patch(task, { hours: event.target.value })}
                    className="ui-control mt-1"
                    disabled={busy}
                  />
                </label>
              </div>

              {draft.rejecting ? (
                <label className="mt-3 block text-xs">
                  <span className="font-semibold">Motivo del rechazo (se le envía a la persona)</span>
                  <textarea
                    value={draft.note}
                    onChange={(event) => patch(task, { note: event.target.value })}
                    rows={2}
                    className="ui-control mt-1"
                    disabled={busy}
                    autoFocus
                  />
                </label>
              ) : null}

              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {draft.rejecting ? (
                  <>
                    <button
                      type="button"
                      onClick={() => patch(task, { rejecting: false, note: "" })}
                      disabled={busy}
                      className="ui-btn ui-btn-secondary ui-btn-sm"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void review(task, "reject")}
                      disabled={busy || !draft.note.trim()}
                      className="ui-btn ui-btn-sm bg-[var(--danger)] text-white"
                    >
                      {busy ? "Rechazando..." : "Confirmar rechazo"}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => patch(task, { rejecting: true })}
                      disabled={busy}
                      className="ui-btn ui-btn-secondary ui-btn-sm text-[var(--danger)]"
                    >
                      Rechazar
                    </button>
                    <button type="button" onClick={() => void review(task, "approve")} disabled={busy} className="ui-btn ui-btn-primary ui-btn-sm">
                      {busy ? "Aprobando..." : `Aprobar como ${activityTypeLabels[draft.activityType]}`}
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
