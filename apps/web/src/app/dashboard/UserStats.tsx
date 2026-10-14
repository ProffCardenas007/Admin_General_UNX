"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { specialtyLabels } from "../../lib/specialties";
import { groupAssignedHoursBySpecialty, summarizeUserTasks, toLocalDateKey } from "./metrics";
import { roleLabels, type ProjectRow, type TaskRow, type UserOption } from "./types";

export default function UserStats({
  users,
  tasks,
  projectsById,
}: {
  users: UserOption[];
  tasks: TaskRow[];
  projectsById: Record<string, ProjectRow>;
}) {
  // null = nothing picked yet, so the first non-manager is shown; "" = the user
  // explicitly chose "Selecciona un usuario".
  const [pickedUserId, setSelectedDashboardUserId] = useState<string | null>(null);
  const defaultUserId = useMemo(
    () => users.find((user) => user.role !== "manager")?.id ?? users[0]?.id ?? "",
    [users],
  );
  const selectedDashboardUserId =
    pickedUserId !== null && (pickedUserId === "" || users.some((user) => user.id === pickedUserId))
      ? pickedUserId
      : defaultUserId;

  const selectedDashboardUser = useMemo(
    () => users.find((user) => user.id === selectedDashboardUserId),
    [users, selectedDashboardUserId],
  );

  const selectedDashboardUserTasks = useMemo(
    () =>
      selectedDashboardUserId
        ? tasks.filter((task) => task.assigneeId === selectedDashboardUserId)
        : [],
    [selectedDashboardUserId, tasks],
  );

  const selectedDashboardUserSummary = useMemo(
    () => summarizeUserTasks(selectedDashboardUserTasks, toLocalDateKey(new Date())),
    [selectedDashboardUserTasks],
  );

  const selectedUserAssignedHoursBySpecialty = useMemo(
    () =>
      selectedDashboardUserId
        ? groupAssignedHoursBySpecialty(selectedDashboardUserTasks, projectsById, specialtyLabels)
        : [],
    [projectsById, selectedDashboardUserId, selectedDashboardUserTasks],
  );

  const selectedSpecialtyHoursMax = useMemo(
    () => Math.max(...selectedUserAssignedHoursBySpecialty.map((row) => row.hours), 1),
    [selectedUserAssignedHoursBySpecialty],
  );

  return (
    <section id="usuarios" className="kpi-card fade-up p-5 scroll-mt-6" style={{ animationDelay: "380ms" }}>
      <h2 className="text-lg font-semibold">Usuarios</h2>
          <>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Selecciona un lider o colaborador para ver su estadistica de tareas desde el dashboard.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(260px,340px),1fr]">
              <select
                name="dashboard-user-stats-select"
                value={selectedDashboardUserId}
                onChange={(event) => setSelectedDashboardUserId(event.target.value)}
                className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
              >
                <option value="">Selecciona un usuario</option>
                {users
                  .filter((user) => user.role !== "manager")
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.fullName} ({roleLabels[user.role]})
                    </option>
                  ))}
              </select>
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                <article className="rounded-2xl border border-[var(--line)] bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">Asignadas</p>
                  <p className="mt-2 text-xl font-semibold">{selectedDashboardUserSummary.total}</p>
                </article>
                <article className="rounded-2xl border border-[var(--line)] bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">Abiertas</p>
                  <p className="mt-2 text-xl font-semibold text-[var(--accent)]">{selectedDashboardUserSummary.active}</p>
                </article>
                <article className="rounded-2xl border border-[var(--line)] bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">Finalizadas</p>
                  <p className="mt-2 text-xl font-semibold text-emerald-700">{selectedDashboardUserSummary.done}</p>
                </article>
                <article className="rounded-2xl border border-[var(--line)] bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">Bloqueadas</p>
                  <p className="mt-2 text-xl font-semibold text-[var(--danger)]">{selectedDashboardUserSummary.blocked}</p>
                </article>
                <article className="rounded-2xl border border-[var(--line)] bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">Vencidas</p>
                  <p className="mt-2 text-xl font-semibold text-[var(--danger)]">{selectedDashboardUserSummary.overdue}</p>
                </article>
                <article className="rounded-2xl border border-[var(--line)] bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">Urgentes</p>
                  <p className="mt-2 text-xl font-semibold text-amber-700">{selectedDashboardUserSummary.urgent}</p>
                </article>
              </div>
            </div>

            <div className="mt-4 grid gap-4">
              <article className="rounded-2xl border border-[var(--line)] bg-white p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                  Horas asignadas por especialidad
                </p>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  {selectedDashboardUser
                    ? `${selectedDashboardUser.fullName} · distribucion por academia`
                    : "Selecciona un usuario para ver su distribucion"}
                </p>

                {!selectedDashboardUser || selectedUserAssignedHoursBySpecialty.length === 0 ? (
                  <p className="mt-4 text-sm text-[var(--ink-muted)]">
                    Sin horas asignadas por especialidad para mostrar.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {selectedUserAssignedHoursBySpecialty.map((row) => {
                      const pct = Math.min((row.hours / selectedSpecialtyHoursMax) * 100, 100);
                      return (
                        <div key={row.specialty}>
                          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                            <p className="font-semibold">{row.specialty}</p>
                            <p className="text-[var(--ink-muted)]">{row.hours.toFixed(2)} h ({row.tasks} tareas)</p>
                          </div>
                          <div className="bar-track">
                            <div className="bar-fill" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            </div>

            <div className="mt-4 rounded-2xl border border-dashed border-[var(--line)] bg-[var(--background)] p-4 text-sm text-[var(--ink-muted)]">
              Para ver resumen quincenal por proyecto y porcentajes por persona, abre el apartado de reporte.
              <div className="mt-3">
                <Link href="/quincenas" className="ui-btn ui-btn-secondary ui-btn-sm">Abrir reporte</Link>
              </div>
            </div>
          </>
    </section>
  );
}
