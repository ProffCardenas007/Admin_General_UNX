"use client";

import { useEffect, useState } from "react";
import {
  authorizedHoursFor,
  formatActiveDuration,
  formatClock,
  isTimerStale,
  summarizeActiveTasks,
  timerProgress,
  totalTimerSeconds,
} from "./timer";
import type { TaskRow } from "./types";

/**
 * "Mis tareas en curso": the person's tasks that are running or paused, each with
 * the time already saved, how much of the authorized hours it has used and the
 * buttons to start, pause or finish it.
 */
export default function ActiveTasksPanel({
  tasks,
  availableTasks,
  canClaim,
  projectLabel,
  savingTaskId,
  onClaim,
  onStart,
  onPause,
  onFinish,
  onRequestExtension,
}: {
  /** Already filtered to the signed-in person's running and paused tasks. */
  tasks: TaskRow[];
  /** Pending tasks published without an assignee. */
  availableTasks: TaskRow[];
  canClaim: boolean;
  projectLabel: (projectId: string) => string;
  savingTaskId: string;
  onClaim: (taskId: string) => void;
  onStart: (taskId: string) => void;
  onPause: (taskId: string) => void;
  onFinish: (taskId: string) => void;
  onRequestExtension: (task: TaskRow) => void;
}) {
  const hasRunning = tasks.some((task) => !!task.timerStartedAt);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Tick every second only while a timer is actually running.
  useEffect(() => {
    if (!hasRunning) {
      return;
    }
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [hasRunning]);

  const summary = summarizeActiveTasks(tasks, nowMs);

  return (
    <section
      className="mt-5 rounded-2xl border border-[var(--line)] bg-white p-4"
      aria-label="Mis tareas en curso"
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Mis tareas en curso</h2>
          <p className="text-sm text-[var(--ink-muted)]">
            El tiempo se guarda al pausar o finalizar. Al iniciar otra tarea, la que estaba corriendo se pausa
            sola.
          </p>
        </div>
        {tasks.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-emerald-700">
              {summary.running} corriendo
            </span>
            <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-amber-700">
              {summary.paused} en pausa
            </span>
            <span className="rounded-full border border-[var(--line)] bg-[var(--background)] px-3 py-1">
              Tiempo registrado: {formatActiveDuration({ activeSeconds: summary.totalSeconds }, nowMs)}
            </span>
          </div>
        ) : null}
      </div>

      {tasks.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-[var(--line)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--ink-muted)]">
          No tienes tareas en curso ni en pausa. Inicia una desde la lista de abajo y aparecerá aquí con su
          tiempo.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {tasks.map((task) => {
            const running = task.status === "doing";
            const progress = timerProgress(task, nowMs);
            const stale = running && isTimerStale(task, nowMs);
            const saving = savingTaskId === task.id;

            return (
              <article
                key={task.id}
                className={`flex flex-col rounded-2xl border p-4 ${
                  progress.over
                    ? "border-red-300 bg-red-50"
                    : running
                      ? "border-emerald-300 bg-emerald-50/40"
                      : "border-[var(--line)] bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-2 text-xs font-semibold ${
                      running ? "text-emerald-700" : "text-amber-700"
                    }`}
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        running ? "animate-pulse bg-emerald-500" : "bg-amber-500"
                      }`}
                    />
                    {running ? "En curso" : "En pausa"}
                  </span>
                  <span className="font-mono text-xs text-[var(--ink-muted)]">{task.code}</span>
                </div>

                <p className="mt-2 break-words text-sm font-semibold">{task.title}</p>
                <p className="mt-0.5 truncate text-xs text-[var(--ink-muted)]" title={projectLabel(task.projectId)}>
                  {projectLabel(task.projectId)}
                </p>

                <p
                  className={`mt-3 font-mono text-3xl font-bold ${
                    progress.over ? "text-red-700" : "text-[var(--foreground)]"
                  }`}
                  aria-label="Tiempo acumulado"
                >
                  {formatClock(totalTimerSeconds(task, nowMs))}
                </p>
                <p className="text-xs text-[var(--ink-muted)]">
                  {running && task.timerStartedAt
                    ? `Corriendo desde las ${new Date(task.timerStartedAt).toLocaleTimeString("es-MX", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`
                    : "Tiempo guardado"}
                </p>

                {progress.limitSeconds > 0 ? (
                  <div className="mt-3">
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--background)]">
                      <div
                        className={`h-full rounded-full ${progress.over ? "bg-[var(--danger)]" : "bg-[var(--accent)]"}`}
                        style={{ width: `${progress.percent}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-[var(--ink-muted)]">
                      {formatActiveDuration(task, nowMs)} de {authorizedHoursFor(task).toFixed(1)} h autorizadas
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-[var(--ink-muted)]">Sin horas estimadas</p>
                )}

                {progress.over ? (
                  <button
                    type="button"
                    onClick={() => onRequestExtension(task)}
                    className="ui-btn ui-btn-secondary ui-btn-sm mt-3"
                  >
                    Superaste el tiempo · Solicitar más horas
                  </button>
                ) : null}

                {stale ? (
                  <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Lleva más de 10 horas corriendo. ¿Olvidaste pausarlo? Pausa para guardar el tiempo.
                  </p>
                ) : null}

                <div className="mt-4 grid grid-cols-2 gap-2">
                  {running ? (
                    <button
                      type="button"
                      onClick={() => onPause(task.id)}
                      disabled={saving}
                      className="ui-btn ui-btn-secondary ui-btn-sm disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Pausar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onStart(task.id)}
                      disabled={saving}
                      className="ui-btn ui-btn-primary ui-btn-sm disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Reanudar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onFinish(task.id)}
                    disabled={saving}
                    className="ui-btn ui-btn-secondary ui-btn-sm disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    Finalizar
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="mt-5 border-t border-[var(--line)] pt-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-semibold">Tareas disponibles para tomar</h3>
            <p className="text-sm text-[var(--ink-muted)]">
              Actividades publicadas sin responsable. Al tomar una, quedará asignada a tu usuario.
            </p>
          </div>
          <span className="w-fit rounded-full border border-[var(--line)] bg-[var(--background)] px-3 py-1 text-xs font-semibold">
            {availableTasks.length} disponibles
          </span>
        </div>

        {availableTasks.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-[var(--line)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--ink-muted)]">
            No hay tareas disponibles por el momento.
          </p>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {availableTasks.map((task) => {
              const saving = savingTaskId === task.id;
              return (
                <article key={task.id} className="flex flex-col rounded-2xl border border-sky-200 bg-sky-50/50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-sky-700">Disponible</span>
                    <span className="font-mono text-xs text-[var(--ink-muted)]">{task.code}</span>
                  </div>
                  <p className="mt-2 break-words text-sm font-semibold">{task.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{projectLabel(task.projectId)}</p>
                  {task.description ? (
                    <p className="mt-3 line-clamp-3 text-sm text-[var(--ink-muted)]">{task.description}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-[var(--line)] bg-white px-2 py-1">
                      {Number(task.estimatedHours ?? 0).toFixed(1)} h estimadas
                    </span>
                    {task.dueDate ? (
                      <span className="rounded-full border border-[var(--line)] bg-white px-2 py-1">
                        Vence {task.dueDate.slice(0, 10)}
                      </span>
                    ) : null}
                  </div>
                  {canClaim ? (
                    <button
                      type="button"
                      onClick={() => onClaim(task.id)}
                      disabled={saving}
                      className="ui-btn ui-btn-primary ui-btn-sm mt-4 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {saving ? "Tomando..." : "Tomar tarea"}
                    </button>
                  ) : (
                    <p className="mt-4 text-xs text-[var(--ink-muted)]">
                      Disponible para líderes y colaboradores.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
