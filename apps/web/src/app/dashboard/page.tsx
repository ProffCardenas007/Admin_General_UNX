"use client";

import { useMemo, useState } from "react";
import FortnightActivities from "./FortnightActivities";
import ProjectsPanel from "./ProjectsPanel";
import TaskCreateModal, {
  INITIAL_TASK_DEFAULTS,
  type DashboardMessage,
  type TaskFormDefaults,
} from "./TaskCreateModal";
import TasksPanel from "./TasksPanel";
import TeamAlerts from "./TeamAlerts";
import UserStats from "./UserStats";
import { getCurrentFortnight } from "./metrics";
import { useDashboardData } from "./useDashboardData";

export default function DashboardPage() {
  const currentFortnight = useMemo(() => getCurrentFortnight(), []);
  const {
    role,
    currentUserId,
    loading,
    error,
    setError,
    summary,
    workload,
    classHours,
    tasks,
    setTasks,
    projects,
    users,
    teams,
    projectProgressById,
  } = useDashboardData(currentFortnight);

  const [info, setInfo] = useState("");
  const [taskModal, setTaskModal] = useState<{ open: boolean; projectId?: string }>({ open: false });
  const [taskDefaults, setTaskDefaults] = useState<TaskFormDefaults>(INITIAL_TASK_DEFAULTS);

  const projectsById = useMemo(
    () => Object.fromEntries(projects.map((project) => [project.id, project])),
    [projects],
  );
  const usersById = useMemo(
    () => Object.fromEntries(users.map((user) => [user.id, user])),
    [users],
  );

  const setMessage = (message: DashboardMessage) => {
    setError(message.error ?? "");
    setInfo(message.info ?? "");
  };

  const openTaskModal = (projectId?: string) => {
    setMessage({});
    setTaskModal({ open: true, projectId });
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <section className="glass-panel fade-up p-6 md:p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">
              Sistema de proyectos
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              Panel ejecutivo
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-[var(--ink-muted)] md:text-base">
              Resumen operativo: carga por persona y tendencia semanal.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="#resumen" className="ui-btn ui-btn-secondary ui-btn-sm">Resumen</a>
            <a href="#proyectos" className="ui-btn ui-btn-secondary ui-btn-sm">Proyectos</a>
            <a href="#tareas" className="ui-btn ui-btn-secondary ui-btn-sm">Tareas</a>
            {role === "manager" ? (
              <a href="#alertas" className="ui-btn ui-btn-secondary ui-btn-sm">Alertas</a>
            ) : null}
            {role === "manager" ? (
              <a href="#usuarios" className="ui-btn ui-btn-secondary ui-btn-sm">Usuarios</a>
            ) : null}
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="mt-4 rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/8 px-4 py-3 text-sm text-[var(--foreground)]">
            {info}
          </p>
        ) : null}
        {loading ? (
          <div className="mt-4">
            <div className="ui-skeleton h-6 w-44" />
          </div>
        ) : null}
      </section>

      <section id="resumen" className="grid gap-4 md:grid-cols-2 xl:grid-cols-5 scroll-mt-6">
        {[
          {
            label: "Proyectos activos",
            value: summary?.activeProjects ?? 0,
            tone: "text-[var(--accent)]",
          },
          {
            label: "Avance global",
            value: `${summary?.completionRate ?? 0}%`,
            tone: "text-[var(--accent)]",
          },
          {
            label: "Tareas vencidas",
            value: summary?.overdueTasks ?? 0,
            tone: "text-[var(--danger)]",
          },
          {
            label: "Tareas bloqueadas",
            value: summary?.blockedTasks ?? 0,
            tone: "text-[var(--danger)]",
          },
          {
            label: "Horas registradas",
            value: summary?.hoursWorked ?? 0,
            tone: "text-[var(--accent-2)]",
          },
        ].map((card, index) => (
          <article
            key={card.label}
            className="kpi-card fade-up p-5"
            style={{ animationDelay: `${index * 70}ms` }}
          >
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              {card.label}
            </p>
            <p className={`mt-3 text-3xl font-semibold ${card.tone}`}>{card.value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4">
        <ProjectsPanel
          projects={projects}
          progressById={projectProgressById}
          role={role}
          onCreateTask={openTaskModal}
        />
        <TasksPanel
          tasks={tasks}
          projects={projects}
          projectsById={projectsById}
          users={users}
          usersById={usersById}
          workload={workload}
          role={role}
          currentUserId={currentUserId}
        />
      </section>

      {role === "manager" ? <TeamAlerts users={users} tasks={tasks} /> : null}

      {role === "manager" || role === "lead" ? (
        <FortnightActivities
          users={users}
          tasks={tasks}
          classHours={classHours}
          projectsById={projectsById}
          fortnight={currentFortnight}
        />
      ) : null}

      {role === "manager" ? (
        <UserStats users={users} tasks={tasks} projectsById={projectsById} />
      ) : null}

      {taskModal.open ? (
        <TaskCreateModal
          projects={projects}
          users={users}
          teams={teams}
          presetProjectId={taskModal.projectId}
          defaults={taskDefaults}
          onClose={() => setTaskModal({ open: false })}
          onCreated={(createdTasks, choices) => {
            setTasks((current) => [...createdTasks, ...current]);
            setTaskDefaults(choices);
          }}
          setMessage={setMessage}
        />
      ) : null}
    </div>
  );
}
