"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { computeTeamAlerts } from "./metrics";
import { roleLabels, type TaskRow, type UserOption } from "./types";

export default function TeamAlerts({
  users,
  tasks,
}: {
  users: UserOption[];
  tasks: TaskRow[];
}) {
  const [overloadThresholdHours, setOverloadThresholdHours] = useState(40);
  const teamAlerts = useMemo(
    () => computeTeamAlerts(users, tasks, overloadThresholdHours),
    [users, tasks, overloadThresholdHours],
  );

  return (
      <section id="alertas" className="kpi-card fade-up p-5 scroll-mt-6" style={{ animationDelay: "340ms" }}>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Alertas del equipo</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Colaboradores sin tareas activas y colaboradores con carga por encima del umbral.
            </p>
          </div>
          <label className="text-xs text-[var(--ink-muted)]">
            Umbral de sobrecarga (horas activas)
            <input
              type="number"
              min="1"
              step="1"
              value={overloadThresholdHours}
              onChange={(event) =>
                setOverloadThresholdHours(Math.max(1, Number(event.target.value) || 1))
              }
              className="mt-1 block w-32 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">
              Sin tareas activas ({teamAlerts.withoutActiveTasks.length})
            </p>
            {teamAlerts.withoutActiveTasks.length === 0 ? (
              <p className="mt-3 text-sm text-amber-800/80">
                Todos los colaboradores activos tienen al menos una tarea en curso.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {teamAlerts.withoutActiveTasks.map((row) => (
                  <div
                    key={row.user.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-semibold">{row.user.fullName}</p>
                      <p className="text-xs text-[var(--ink-muted)]">{roleLabels[row.user.role]}</p>
                    </div>
                    <Link
                      href={`/tasks?assigneeId=${row.user.id}`}
                      className="rounded-lg border border-amber-300 bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800"
                    >
                      Asignar tarea
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-700">
              Sobrecarga ({teamAlerts.overloaded.length})
            </p>
            {teamAlerts.overloaded.length === 0 ? (
              <p className="mt-3 text-sm text-red-700/80">
                Nadie supera el umbral de {overloadThresholdHours}h activas por ahora.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {teamAlerts.overloaded.map((row) => (
                  <div
                    key={row.user.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-white px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-semibold">{row.user.fullName}</p>
                      <p className="text-xs text-[var(--ink-muted)]">
                        {roleLabels[row.user.role]} · {row.activeHours.toFixed(1)} h en {row.activeTasksCount} tarea(s)
                      </p>
                    </div>
                    <Link
                      href={`/tasks?assigneeId=${row.user.id}`}
                      className="rounded-lg border border-red-300 bg-red-100 px-2 py-1 text-xs font-semibold text-red-700"
                    >
                      Ver tareas
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
  );
}
