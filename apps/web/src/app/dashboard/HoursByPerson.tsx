"use client";

import { useMemo, useState } from "react";
import type { UserOption, WorkloadRow } from "./types";

export default function HoursByPerson({
  workload,
  usersById,
  currentUserId,
}: {
  workload: WorkloadRow[];
  usersById: Record<string, UserOption>;
  currentUserId: string;
}) {
  const [assignedHoursExpanded, setAssignedHoursExpanded] = useState(false);
  const [actualHoursExpanded, setActualHoursExpanded] = useState(false);

  const workloadMax = useMemo(
    () =>
      Math.max(...workload.map((item) => Number(item.estimatedHours ?? item.hoursWorked ?? 0)), 1),
    [workload],
  );

  const activeHoursMax = useMemo(
    () => Math.max(...workload.map((item) => Number(item.workedHours ?? 0)), 1),
    [workload],
  );

  return (
          <div className="mt-5 space-y-4">
            <div>
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                  Horas asignadas por colaborador
                </p>
                <button
                  type="button"
                  onClick={() => setAssignedHoursExpanded((current) => !current)}
                  className="ui-btn ui-btn-secondary ui-btn-sm"
                >
                  {assignedHoursExpanded ? "Ocultar horas" : "Desplegar horas"}
                </button>
              </div>
              {assignedHoursExpanded ? (
                <div className="mt-3">
                  {workload.length === 0 ? (
                    <p className="text-sm text-[var(--ink-muted)]">Sin datos aún.</p>
                  ) : (
                    workload.map((row) => {
                      const hours = Number(row.estimatedHours ?? row.hoursWorked ?? 0);
                      const pct = Math.min((hours / workloadMax) * 100, 100);
                      const workloadUser = usersById[row.userId];
                      const workloadLabel = workloadUser?.fullName
                        ? workloadUser.fullName
                        : row.userId === currentUserId
                          ? "Mi usuario"
                          : row.userId.slice(0, 8);
                      return (
                        <div key={row.userId} className="mb-3">
                          <div className="mb-1 flex items-center justify-between gap-3">
                            <p className="text-xs font-semibold">{workloadLabel}</p>
                            <p className="text-sm text-[var(--ink-muted)]">
                              {hours.toFixed(2)} h ({row.tasksCount} tareas)
                            </p>
                          </div>
                          <div className="bar-track">
                            <div className="bar-fill" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : null}
            </div>

            <div>
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                  Horas reales trabajadas (cronómetro + captura manual) por colaborador
                </p>
                <button
                  type="button"
                  onClick={() => setActualHoursExpanded((current) => !current)}
                  className="ui-btn ui-btn-secondary ui-btn-sm"
                >
                  {actualHoursExpanded ? "Ocultar horas" : "Desplegar horas"}
                </button>
              </div>
              {actualHoursExpanded ? (
                <div className="mt-3">
                  {workload.length === 0 ? (
                    <p className="text-sm text-[var(--ink-muted)]">Sin datos aún.</p>
                  ) : (
                    workload.map((row) => {
                      const activeHours = Number(row.workedHours ?? 0);
                      const estimatedForRow = Number(row.estimatedHours ?? row.hoursWorked ?? 0);
                      const pct = Math.min((activeHours / activeHoursMax) * 100, 100);
                      const workloadUser = usersById[row.userId];
                      const workloadLabel = workloadUser?.fullName
                        ? workloadUser.fullName
                        : row.userId === currentUserId
                          ? "Mi usuario"
                          : row.userId.slice(0, 8);
                      return (
                        <div key={row.userId} className="mb-3">
                          <div className="mb-1 flex items-center justify-between gap-3">
                            <p className="text-xs font-semibold">{workloadLabel}</p>
                            <p className="text-sm text-[var(--ink-muted)]">
                              {activeHours.toFixed(2)} h de {estimatedForRow.toFixed(2)} h estimadas
                            </p>
                          </div>
                          <div className="bar-track">
                            <div
                              className="bar-fill"
                              style={{ width: `${pct}%`, background: "linear-gradient(90deg, var(--accent), #34d399)" }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : null}
            </div>

          </div>
  );
}
