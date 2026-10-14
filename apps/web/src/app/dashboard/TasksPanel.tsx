"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { computeTaskKpis, filterOpenTasks, toLocalDateKey } from "./metrics";
import HoursByPerson from "./HoursByPerson";
import {
  taskPriorityLabels,
  taskStatusLabel,
  type ProjectRow,
  type TaskRow,
  type UserOption,
  type WorkloadRow,
} from "./types";

export default function TasksPanel({
  tasks,
  projects,
  projectsById,
  users,
  usersById,
  workload,
  role,
  currentUserId,
}: {
  tasks: TaskRow[];
  projects: ProjectRow[];
  projectsById: Record<string, ProjectRow>;
  users: UserOption[];
  usersById: Record<string, UserOption>;
  workload: WorkloadRow[];
  role: string;
  currentUserId: string;
}) {
  const [taskProjectFilter, setTaskProjectFilter] = useState("");
  const [taskUserFilter, setTaskUserFilter] = useState("");
  const [taskSearchFilter, setTaskSearchFilter] = useState("");
  const [tasksExpanded, setTasksExpanded] = useState(false);

  const taskKpis = useMemo(
    () => computeTaskKpis(tasks, currentUserId, toLocalDateKey(new Date())),
    [tasks, currentUserId],
  );

  const openTasks = useMemo(() => tasks.filter((task) => task.status !== "done"), [tasks]);

  const taskProjectOptions = useMemo(() => {
    const ids = new Set(openTasks.map((task) => task.projectId));
    return projects.filter((project) => ids.has(project.id));
  }, [projects, openTasks]);

  const taskUserOptions = useMemo(() => {
    const ids = new Set(openTasks.map((task) => task.assigneeId).filter(Boolean) as string[]);
    return users.filter((user) => ids.has(user.id));
  }, [users, openTasks]);

  const filteredTaskRows = useMemo(
    () =>
      filterOpenTasks(openTasks, projectsById, {
        projectId: taskProjectFilter,
        userId: taskUserFilter,
        search: taskSearchFilter,
      }),
    [openTasks, projectsById, taskProjectFilter, taskSearchFilter, taskUserFilter],
  );

  return (
        <article id="tareas" className="kpi-card fade-up p-5 scroll-mt-6" style={{ animationDelay: "300ms" }}>
          <h2 className="text-lg font-semibold">Tareas</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Operacion diaria con foco en vencimientos, bloqueos y ejecucion del equipo.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "Abiertas", value: taskKpis.total - taskKpis.done, tone: "text-[var(--foreground)]" },
              { label: "En curso", value: taskKpis.doing, tone: "text-[var(--accent)]" },
              { label: "Bloqueadas", value: taskKpis.blocked, tone: "text-[var(--danger)]" },
              { label: "Vencidas", value: taskKpis.overdue, tone: "text-[var(--danger)]" },
              { label: "Vencen pronto", value: taskKpis.dueSoon, tone: "text-amber-700" },
            ].map((card) => (
              <div key={card.label} className="rounded-2xl border border-[var(--line)] bg-white p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">{card.label}</p>
                <p className={`mt-2 text-xl font-semibold ${card.tone}`}>{card.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
            <p className="text-sm text-[var(--ink-muted)]">
              {tasksExpanded
                ? `Mostrando ${filteredTaskRows.length} tarea(s) en el listado.`
                : "Lista de tareas"}
            </p>
            <button
              type="button"
              onClick={() => setTasksExpanded((current) => !current)}
              className="ui-btn ui-btn-secondary ui-btn-sm"
            >
              {tasksExpanded ? "Ocultar tareas" : "Desplegar tareas"}
            </button>
          </div>

          {tasksExpanded ? (
            <>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <select
                  name="dashboard-task-project-filter"
                  value={taskProjectFilter}
                  onChange={(event) => setTaskProjectFilter(event.target.value)}
                  className="ui-control"
                >
                  <option value="">Todos los proyectos</option>
                  {taskProjectOptions.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>

                <input
                  name="dashboard-task-search"
                  value={taskSearchFilter}
                  onChange={(event) => setTaskSearchFilter(event.target.value)}
                  className="ui-control"
                  placeholder="Buscar tarea"
                />

                <select
                  name="dashboard-task-user-filter"
                  value={taskUserFilter}
                  onChange={(event) => setTaskUserFilter(event.target.value)}
                  className="ui-control"
                >
                  <option value="">Todos los usuarios</option>
                  {taskUserOptions.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.fullName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--line)] bg-white">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[var(--line)] bg-[var(--background)]/60 text-left">
                      <th className="px-3 py-3 font-semibold">Proyecto</th>
                      <th className="px-3 py-3 font-semibold">Tarea</th>
                      <th className="px-3 py-3 font-semibold">Usuario</th>
                      <th className="px-3 py-3 font-semibold">Estado</th>
                      <th className="px-3 py-3 font-semibold">Prioridad</th>
                      <th className="px-3 py-3 font-semibold">Vence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTaskRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-4 text-center">
                          <span className="ui-empty inline-block px-4 py-2 text-sm">
                            No hay tareas para los filtros seleccionados.
                          </span>
                        </td>
                      </tr>
                    ) : (
                      filteredTaskRows.map((task) => (
                        <tr key={task.id} className="border-b border-[var(--line)]/50 align-top">
                          <td className="px-3 py-3">
                            <p className="font-semibold">{projectsById[task.projectId]?.name ?? "-"}</p>
                            <p className="mt-1 font-mono text-xs text-[var(--ink-muted)]">
                              {projectsById[task.projectId]?.code ?? "-"}
                            </p>
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-semibold">{task.title}</p>
                            <p className="mt-1 text-xs text-[var(--ink-muted)]">{task.activityType}</p>
                          </td>
                          <td className="px-3 py-3">
                            {task.assigneeId
                              ? (usersById[task.assigneeId]?.fullName ?? task.assigneeId.slice(0, 8))
                              : "Sin asignar"}
                          </td>
                          <td className="px-3 py-3">{taskStatusLabel(task)}</td>
                          <td className="px-3 py-3">{taskPriorityLabels[task.priority] ?? task.priority}</td>
                          <td className="px-3 py-3">{task.dueDate ?? "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/tasks"
                  className="rounded-full border border-[var(--line)] bg-white px-3 py-2 text-xs font-semibold"
                >
                  Ir a tareas
                </Link>
              </div>

              <div className="mt-4 rounded-2xl border border-dashed border-[var(--line)] bg-[var(--background)] p-4 text-sm text-[var(--ink-muted)]">
                {role === "worker"
                  ? `Tienes ${taskKpis.myTasks} tarea(s) pendiente(s) asignadas a tu usuario.`
                  : `Hay ${taskKpis.urgent} tarea(s) urgentes activas y ${taskKpis.todo} en por hacer.`}
              </div>
            </>
          ) : null}

          <HoursByPerson workload={workload} usersById={usersById} currentUserId={currentUserId} />
        </article>
  );
}
