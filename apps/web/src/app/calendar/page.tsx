"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL, authHeaders, getStoredEmail, getStoredRole, getStoredToken, getStoredUserId } from "../../lib/api";
import { specialtyLabels, type LeadSpecialty } from "../../lib/specialties";

type ProjectRow = {
  id: string;
  code: string;
  name: string;
  scope?: LeadSpecialty | null;
  status: "planned" | "active" | "on_hold" | "done" | "cancelled";
  startDate?: string;
  endDate?: string;
};

type TaskRow = {
  id: string;
  code: string;
  projectId: string;
  parentTaskId?: string | null;
  activityType:
    | "revision"
    | "edicion"
    | "creacion"
    | "presentaciones"
    | "grabacion"
    | "plataforma"
    | "administrativo";
  title: string;
  description?: string;
  createdBy?: string | null;
  assigneeId?: string;
  status: "todo" | "doing" | "blocked" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  dueDate?: string;
  estimatedHours?: string;
};

type UserRow = {
  id: string;
  fullName: string;
  role: "manager" | "lead" | "worker";
};

type CalendarEvent = {
  id: string;
  kind: "project" | "task";
  date: string;
  label: string;
  meta: string;
  tone: string;
  sort: number;
  relation?: "created" | "assigned" | "both";
};

const monthFormatter = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  year: "numeric",
});

const fullDateFormatter = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const shortWeekdayFormatter = new Intl.DateTimeFormat("es-MX", {
  weekday: "short",
});

const taskPriorityLabels: Record<TaskRow["priority"], string> = {
  low: "baja",
  medium: "media",
  high: "alta",
  urgent: "urgente",
};

const taskStatusLabels: Record<TaskRow["status"], string> = {
  todo: "por hacer",
  doing: "en curso",
  blocked: "bloqueada",
  done: "finalizada",
};

const activityTypeLabels: Record<TaskRow["activityType"], string> = {
  revision: "revision",
  edicion: "edicion",
  creacion: "creacion",
  presentaciones: "presentaciones",
  grabacion: "grabacion",
  plataforma: "plataforma",
  administrativo: "administrativo",
};

const roleLabels: Record<UserRow["role"], string> = {
  manager: "gerencia",
  lead: "lider",
  worker: "colaborador",
};

const projectToneByStatus: Record<ProjectRow["status"], string> = {
  planned: "border-slate-200 bg-slate-100 text-slate-700",
  active: "border-emerald-200 bg-emerald-100 text-emerald-700",
  on_hold: "border-amber-200 bg-amber-100 text-amber-800",
  done: "border-sky-200 bg-sky-100 text-sky-700",
  cancelled: "border-rose-200 bg-rose-100 text-rose-700",
};

const taskToneByRelation: Record<"created" | "assigned" | "both", string> = {
  created: "border-indigo-200 bg-indigo-100 text-indigo-800",
  assigned: "border-cyan-200 bg-cyan-100 text-cyan-800",
  both: "border-fuchsia-200 bg-fuchsia-100 text-fuchsia-800",
};

const taskRelationLabels: Record<"created" | "assigned" | "both", string> = {
  created: "Creada por mi",
  assigned: "Asignada a mi",
  both: "Creada y asignada a mi",
};

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function buildMonthGrid(baseDate: Date) {
  const monthStart = startOfMonth(baseDate);
  const monthEnd = endOfMonth(baseDate);
  const startShift = (monthStart.getDay() + 6) % 7;
  const gridStart = addDays(monthStart, -startShift);
  const endShift = 6 - ((monthEnd.getDay() + 6) % 7);
  const gridEnd = addDays(monthEnd, endShift);
  const days: Date[] = [];

  for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor = addDays(cursor, 1)) {
    days.push(new Date(cursor));
  }

  return days;
}

function getTaskRelation(task: TaskRow, userId: string) {
  const isCreator = task.createdBy === userId;
  const isAssignee = task.assigneeId === userId;

  if (isCreator && isAssignee) {
    return "both" as const;
  }

  if (isCreator) {
    return "created" as const;
  }

  return "assigned" as const;
}

export default function CalendarPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [savingTaskId, setSavingTaskId] = useState("");
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => toIsoDate(new Date()));
  const [taskSearch, setTaskSearch] = useState("");
  const [showDoneTasks, setShowDoneTasks] = useState(false);
  const [selectedCalendarUserId, setSelectedCalendarUserId] = useState("");
  const [relationFilter, setRelationFilter] = useState<"both" | "created" | "assigned">("both");
  const [taskKindFilter, setTaskKindFilter] = useState<"all" | "principal">("all");
  const [openedTaskId, setOpenedTaskId] = useState("");

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.replace("/");
      return;
    }

    const savedRole = getStoredRole();
    setEmail(getStoredEmail());
    setRole(savedRole);
    setCurrentUserId(getStoredUserId());

    const loadCalendar = async () => {
      try {
        const headers = authHeaders();
        const [projectsResponse, usersResponse] = await Promise.allSettled([
          axios.get(`${API_URL}/projects`, { headers }),
          axios.get(`${API_URL}/users`, { headers }),
        ]);

        let loadedTasks: TaskRow[] = [];
        if (savedRole === "lead") {
          const [myTasksResponse, assignedTasksResponse] = await Promise.all([
            axios.get(`${API_URL}/tasks`, { headers, params: { scope: "my" } }),
            axios.get(`${API_URL}/tasks`, { headers, params: { scope: "assigned" } }),
          ]);

          const deduped = new Map<string, TaskRow>();
          [...(myTasksResponse.data as TaskRow[]), ...(assignedTasksResponse.data as TaskRow[])].forEach((task) => {
            deduped.set(task.id, task);
          });
          loadedTasks = [...deduped.values()];
        } else if (savedRole === "worker") {
          const myTasksResponse = await axios.get(`${API_URL}/tasks`, { headers, params: { scope: "my" } });
          loadedTasks = myTasksResponse.data as TaskRow[];
        } else {
          const tasksResponse = await axios.get(`${API_URL}/tasks`, { headers });
          loadedTasks = tasksResponse.data as TaskRow[];
        }

        if (projectsResponse.status === "fulfilled") {
          setProjects(projectsResponse.value.data as ProjectRow[]);
        }
        if (usersResponse.status === "fulfilled") {
          const loadedUsers = usersResponse.value.data as UserRow[];
          setUsers(loadedUsers);
          setSelectedCalendarUserId((current) => {
            if (current && loadedUsers.some((user) => user.id === current)) {
              return current;
            }

            return getStoredUserId();
          });
        }

        setTasks(loadedTasks);
      } catch {
        setError("No se pudo cargar el calendario. Verifica la conexión con backend.");
      } finally {
        setLoading(false);
      }
    };

    void loadCalendar();
  }, [router]);

  const usersById = useMemo(() => {
    return Object.fromEntries(users.map((user) => [user.id, user]));
  }, [users]);

  const projectsById = useMemo(() => {
    return Object.fromEntries(projects.map((project) => [project.id, project]));
  }, [projects]);

  const canInspectOtherUsers = role === "manager" || role === "lead";

  const effectiveCalendarUserId = canInspectOtherUsers
    ? (selectedCalendarUserId || currentUserId)
    : currentUserId;

  const calendarUserOptions = useMemo(() => {
    if (role === "manager") {
      return users.filter((user) => user.role !== "manager");
    }

    if (role === "lead") {
      return users.filter((user) => user.role === "worker" || user.id === currentUserId);
    }

    return [];
  }, [users]);

  const visibleTasks = useMemo(() => {
    return tasks.filter((task) => {
      const relation = getTaskRelation(task, effectiveCalendarUserId);
      const matchesUser =
        task.createdBy === effectiveCalendarUserId ||
        task.assigneeId === effectiveCalendarUserId;
      if (!matchesUser) {
        return false;
      }

      if (relationFilter !== "both" && relation !== relationFilter) {
        return false;
      }

      if (!showDoneTasks && task.status === "done") {
        return false;
      }

      if (canInspectOtherUsers && taskKindFilter === "principal" && task.parentTaskId) {
        return false;
      }

      if (taskSearch.trim().length === 0) {
        return true;
      }

      const project = projectsById[task.projectId];
      const search = taskSearch.toLowerCase();
      return (
        task.title.toLowerCase().includes(search) ||
        task.code.toLowerCase().includes(search) ||
        (project?.name ?? "").toLowerCase().includes(search) ||
        (project?.code ?? "").toLowerCase().includes(search)
      );
    });
  }, [
    canInspectOtherUsers,
    effectiveCalendarUserId,
    projectsById,
    relationFilter,
    showDoneTasks,
    taskKindFilter,
    taskSearch,
    tasks,
  ]);

  const visibleProjects = useMemo(() => {
    const projectIds = new Set(visibleTasks.map((task) => task.projectId));
    return projects.filter((project) => project.status === "active" && projectIds.has(project.id));
  }, [projects, visibleTasks]);

  const monthDays = useMemo(() => buildMonthGrid(currentMonth), [currentMonth]);

  const visibleMonthEvents = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const events: CalendarEvent[] = [];

    visibleProjects.forEach((project) => {
      if (!project.startDate && !project.endDate) {
        return;
      }

      const projectMilestones = [
        project.startDate
          ? {
              id: `${project.id}-start`,
              date: project.startDate,
              label: `${project.code} · Inicio`,
            }
          : undefined,
        project.endDate
          ? {
              id: `${project.id}-end`,
              date: project.endDate,
              label: `${project.code} · Fin`,
            }
          : undefined,
      ].filter((item): item is { id: string; date: string; label: string } => !!item);

      projectMilestones.forEach((milestone) => {
        const milestoneDate = parseLocalDate(milestone.date);
        if (milestoneDate < monthStart || milestoneDate > monthEnd) {
          return;
        }

        events.push({
          id: milestone.id,
          kind: "project",
          date: milestone.date,
          label: milestone.label,
          meta: `${project.name}${project.scope ? ` · ${specialtyLabels[project.scope]}` : ""}`,
          tone: projectToneByStatus[project.status],
          sort: 1,
        });
      });
    });

    visibleTasks.forEach((task) => {
      if (!task.dueDate) {
        return;
      }

      const taskDate = parseLocalDate(task.dueDate);
      if (taskDate < monthStart || taskDate > monthEnd) {
        return;
      }

      const project = projectsById[task.projectId];
      const assignee = task.assigneeId ? usersById[task.assigneeId] : undefined;
      const relation = getTaskRelation(task, effectiveCalendarUserId);
      events.push({
        id: task.id,
        kind: "task",
        date: task.dueDate,
        label: task.code,
        meta: `${task.title}${project ? ` · ${project.code}` : ""}${assignee ? ` · ${assignee.fullName}` : ""}`,
        tone: taskToneByRelation[relation],
        sort: 2,
        relation,
      });
    });

    return events;
  }, [currentMonth, effectiveCalendarUserId, projectsById, usersById, visibleProjects, visibleTasks]);

  const eventsByDate = useMemo(() => {
    return visibleMonthEvents.reduce<Record<string, CalendarEvent[]>>((accumulator, event) => {
      if (!accumulator[event.date]) {
        accumulator[event.date] = [];
      }

      accumulator[event.date].push(event);
      accumulator[event.date].sort((left, right) => left.sort - right.sort || left.label.localeCompare(right.label));
      return accumulator;
    }, {});
  }, [visibleMonthEvents]);

  const selectedDayEvents = eventsByDate[selectedDate] ?? [];
  const selectedDayLabel = useMemo(() => {
    return fullDateFormatter.format(parseLocalDate(selectedDate));
  }, [selectedDate]);
  const openedTask = openedTaskId
    ? tasks.find((task) => task.id === openedTaskId)
    : undefined;
  const openedTaskProject = openedTask ? projectsById[openedTask.projectId] : undefined;
  const openedTaskAssignee = openedTask?.assigneeId ? usersById[openedTask.assigneeId] : undefined;
  const openedTaskParent = openedTask?.parentTaskId
    ? tasks.find((task) => task.id === openedTask.parentTaskId)
    : undefined;
  const openedTaskIsPrincipal = openedTask ? !openedTask.parentTaskId : false;
  const openedConsequentTasks = openedTask
    ? tasks
        .filter((task) => task.parentTaskId === openedTask.id)
        .sort((left, right) => {
          const leftDate = left.dueDate ?? "9999-12-31";
          const rightDate = right.dueDate ?? "9999-12-31";
          return leftDate.localeCompare(rightDate) || left.code.localeCompare(right.code);
        })
    : [];

  const calendarStats = useMemo(() => {
    const projectSpanCount = visibleProjects.length;
    const dueTasks = visibleTasks.filter((task) => !!task.dueDate).length;
    const urgentTasks = visibleTasks.filter((task) => task.priority === "urgent" && task.status !== "done").length;
    const blockedTasks = visibleTasks.filter((task) => task.status === "blocked").length;

    return {
      projectSpanCount,
      dueTasks,
      urgentTasks,
      blockedTasks,
    };
  }, [visibleProjects, visibleTasks]);

  const onLogout = () => {
    window.localStorage.removeItem("sistema_mvp_token");
    window.localStorage.removeItem("sistema_mvp_email");
    window.localStorage.removeItem("sistema_mvp_role");
    window.localStorage.removeItem("sistema_mvp_specialty");
    window.localStorage.removeItem("sistema_mvp_specialties");
    router.replace("/");
  };

  const onUpdateTaskStatus = async (
    taskId: string,
    nextStatus: TaskRow["status"],
  ) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.status === nextStatus) {
      return;
    }

    setError("");
    setInfo("");
    setSavingTaskId(taskId);

    try {
      const response = await axios.patch(
        `${API_URL}/tasks/${taskId}`,
        { status: nextStatus },
        { headers: authHeaders() },
      );

      const updatedTask = response.data as TaskRow;
      setTasks((current) =>
        current.map((item) => (item.id === taskId ? { ...item, ...updatedTask } : item)),
      );
      setInfo(`Tarea ${task.code} actualizada a ${taskStatusLabels[updatedTask.status]}.`);
    } catch {
      setError("No se pudo actualizar el estado de la tarea desde el calendario.");
    } finally {
      setSavingTaskId("");
    }
  };

  const onUpdateTaskAssignee = async (taskId: string, nextAssigneeId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    const normalizedAssigneeId = nextAssigneeId || undefined;

    if (!task || task.assigneeId === normalizedAssigneeId) {
      return;
    }

    setError("");
    setInfo("");
    setSavingTaskId(taskId);

    try {
      const response = await axios.patch(
        `${API_URL}/tasks/${taskId}`,
        { assigneeId: normalizedAssigneeId },
        { headers: authHeaders() },
      );

      const updatedTask = response.data as TaskRow;
      setTasks((current) =>
        current.map((item) => (item.id === taskId ? { ...item, ...updatedTask } : item)),
      );

      const nextAssignee = updatedTask.assigneeId
        ? usersById[updatedTask.assigneeId]?.fullName ?? "responsable seleccionado"
        : "sin responsable";
      setInfo(`Tarea ${task.code} reasignada a ${nextAssignee}.`);
    } catch {
      setError("No se pudo reasignar el responsable desde el calendario.");
    } finally {
      setSavingTaskId("");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <section className="glass-panel fade-up p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">
              Sistema de proyectos
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Calendario</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--ink-muted)] md:text-base">
              {email ? `Sesion activa como ${email}.` : "Sesion activa."} Aqui puedes visualizar proyectos activos y vencimientos de tareas en una vista mensual para planificacion.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {role === "worker" ? (
              <>
                <Link href="/tasks" className="ui-btn ui-btn-secondary">
                  Ver tareas
                </Link>
                <button onClick={onLogout} className="ui-btn ui-btn-secondary">
                  Cerrar sesión
                </button>
              </>
            ) : (
              <>
                <Link href="/dashboard" className="ui-btn ui-btn-secondary">
                  Volver al panel
                </Link>
                <Link href="/projects" className="ui-btn ui-btn-secondary">
                  Ver proyectos
                </Link>
                <Link href="/tasks" className="ui-btn ui-btn-primary">
                  Ver tareas
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="kpi-card p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">Proyectos activos</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--accent)]">{calendarStats.projectSpanCount}</p>
          </article>
          <article className="kpi-card p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">Tareas con fecha</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--accent-2)]">{calendarStats.dueTasks}</p>
          </article>
          <article className="kpi-card p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">Urgentes</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--danger)]">{calendarStats.urgentTasks}</p>
          </article>
          <article className="kpi-card p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">Bloqueadas</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--danger)]">{calendarStats.blockedTasks}</p>
          </article>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-[1.2fr_minmax(240px,320px)_auto]">
          <input
            value={taskSearch}
            onChange={(event) => setTaskSearch(event.target.value)}
            className="ui-control"
            placeholder="Buscar tarea o proyecto"
          />
          <div className="grid gap-3">
            <label className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-[var(--foreground)]">
              <input
                type="checkbox"
                checked={showDoneTasks}
                onChange={(event) => setShowDoneTasks(event.target.checked)}
              />
              Mostrar tareas finalizadas
            </label>
            {canInspectOtherUsers ? (
              <>
                <select
                  value={selectedCalendarUserId || currentUserId}
                  onChange={(event) => setSelectedCalendarUserId(event.target.value)}
                  className="ui-control"
                >
                  <option value={currentUserId}>Mis actividades</option>
                  {calendarUserOptions.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.fullName} ({roleLabels[user.role]})
                    </option>
                  ))}
                </select>
                <select
                  value={relationFilter}
                  onChange={(event) =>
                    setRelationFilter(event.target.value as "both" | "created" | "assigned")
                  }
                  className="ui-control"
                >
                  <option value="both">Creadas y asignadas</option>
                  <option value="created">Solo creadas</option>
                  <option value="assigned">Solo asignadas</option>
                </select>
                <select
                  value={taskKindFilter}
                  onChange={(event) =>
                    setTaskKindFilter(event.target.value as "all" | "principal")
                  }
                  className="ui-control"
                >
                  <option value="all">Todas las tareas</option>
                  <option value="principal">Solo tareas principales</option>
                </select>
              </>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentMonth((current) => addMonths(current, -1))}
              className="ui-btn ui-btn-secondary"
            >
              Mes anterior
            </button>
            <button
              onClick={() => {
                const today = startOfMonth(new Date());
                setCurrentMonth(today);
                setSelectedDate(toIsoDate(new Date()));
              }}
              className="ui-btn ui-btn-secondary"
            >
              Hoy
            </button>
            <button
              onClick={() => setCurrentMonth((current) => addMonths(current, 1))}
              className="ui-btn ui-btn-secondary"
            >
              Mes siguiente
            </button>
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
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.6fr_0.9fr]">
        <article className="kpi-card overflow-hidden p-0">
          <div className="border-b border-[var(--line)] bg-white/70 px-5 py-4">
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">Vista mensual</p>
            <h2 className="mt-1 text-2xl font-semibold capitalize">{monthFormatter.format(currentMonth)}</h2>
          </div>

          {loading ? (
            <div className="p-5">
              <div className="ui-skeleton h-6 w-52" />
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-px bg-[var(--line)]">
              {monthDays.slice(0, 7).map((day) => (
                <div key={`header-${toIsoDate(day)}`} className="bg-[var(--background)] px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                  {shortWeekdayFormatter.format(day).replace(".", "")}
                </div>
              ))}

              {monthDays.map((day) => {
                const isoDate = toIsoDate(day);
                const dayEvents = eventsByDate[isoDate] ?? [];
                const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                const isSelected = isoDate === selectedDate;
                const visibleChips = dayEvents.slice(0, 3);

                return (
                  <button
                    key={isoDate}
                    onClick={() => setSelectedDate(isoDate)}
                    className={`min-h-[148px] bg-white px-3 py-3 text-left transition hover:bg-[var(--background)] ${
                      isSelected ? "ring-2 ring-[var(--accent)] ring-inset" : ""
                    } ${!isCurrentMonth ? "opacity-55" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-semibold ${isSelected ? "text-[var(--accent)]" : "text-[var(--foreground)]"}`}>
                        {day.getDate()}
                      </span>
                      <span className="text-[11px] text-[var(--ink-muted)]">{dayEvents.length} items</span>
                    </div>

                    <div className="mt-3 space-y-1.5">
                      {visibleChips.map((event) => (
                        <div
                          key={event.id}
                          className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${event.tone}`}
                        >
                          <p>{event.label}</p>
                          {event.kind === "task" && event.relation ? (
                            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.08em] opacity-90">
                              {taskRelationLabels[event.relation]}
                            </p>
                          ) : null}
                          <p className="mt-0.5 line-clamp-2 text-[10px] font-medium opacity-90">{event.meta}</p>
                        </div>
                      ))}
                      {dayEvents.length > visibleChips.length ? (
                        <p className="pt-1 text-[11px] font-semibold text-[var(--ink-muted)]">
                          +{dayEvents.length - visibleChips.length} más
                        </p>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </article>

        <aside className="kpi-card p-5">
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">Detalle del día</p>
          <h2 className="mt-1 text-xl font-semibold capitalize">{selectedDayLabel}</h2>

          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-emerald-700">Proyecto activo</span>
            <span className="rounded-full border border-indigo-200 bg-indigo-100 px-3 py-1 text-indigo-800">Creada por mi</span>
            <span className="rounded-full border border-cyan-200 bg-cyan-100 px-3 py-1 text-cyan-800">Asignada a mi</span>
            <span className="rounded-full border border-fuchsia-200 bg-fuchsia-100 px-3 py-1 text-fuchsia-800">Creada y asignada</span>
          </div>

          {loading ? (
            <div className="mt-4 space-y-3">
              <div className="ui-skeleton h-16 w-full" />
              <div className="ui-skeleton h-16 w-full" />
            </div>
          ) : selectedDayEvents.length === 0 ? (
            <p className="ui-empty mt-4 px-4 py-3 text-sm">No hay proyectos ni tareas agendadas para este día.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {selectedDayEvents.map((event) => {
                const isTask = event.kind === "task";
                const task = isTask ? visibleTasks.find((item) => item.id === event.id) : undefined;
                const project = isTask && task ? projectsById[task.projectId] : undefined;
                const assignee = isTask && task?.assigneeId ? usersById[task.assigneeId] : undefined;

                return (
                  <article key={event.id} className={`rounded-2xl border p-4 ${event.tone}`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">{event.label}</p>
                      <span className="text-[11px] uppercase tracking-[0.12em]">
                        {event.kind === "project" ? "proyecto" : "tarea"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm opacity-90">{event.meta}</p>
                    {isTask && task ? (
                      <div className="mt-3 space-y-1 text-xs opacity-90">
                        <p>Vinculo: {taskRelationLabels[getTaskRelation(task, effectiveCalendarUserId)]}</p>
                        <p>Estado: {taskStatusLabels[task.status]}</p>
                        <p>Prioridad: {taskPriorityLabels[task.priority]}</p>
                        <p>Proyecto: {project ? `${project.code} - ${project.name}` : "Sin proyecto visible"}</p>
                        <p>Responsable: {assignee ? `${assignee.fullName} (${roleLabels[assignee.role]})` : "Sin asignar"}</p>
                        <div className="pt-2">
                          <button
                            onClick={() => setOpenedTaskId(task.id)}
                            className="ui-btn ui-btn-secondary ui-btn-sm"
                          >
                            Abrir detalle
                          </button>
                        </div>
                        {role === "manager" || role === "lead" ? (
                          <div className="pt-2">
                            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] opacity-90">
                              Reasignar responsable
                            </label>
                            <select
                              value={task.assigneeId ?? ""}
                              onChange={(event) =>
                                void onUpdateTaskAssignee(task.id, event.target.value)
                              }
                              disabled={savingTaskId === task.id}
                              className="mt-1 w-full rounded-xl border border-current/20 bg-white/80 px-3 py-2 text-sm text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              <option value="">Sin asignar</option>
                              {users.map((user) => (
                                <option key={user.id} value={user.id}>
                                  {user.fullName} ({roleLabels[user.role]})
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : null}
                        <div className="pt-2">
                          <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] opacity-90">
                            Cambiar estado
                          </label>
                          <select
                            value={task.status}
                            onChange={(event) =>
                              void onUpdateTaskStatus(
                                task.id,
                                event.target.value as TaskRow["status"],
                              )
                            }
                            disabled={savingTaskId === task.id}
                            className="mt-1 w-full rounded-xl border border-current/20 bg-white/80 px-3 py-2 text-sm text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            <option value="todo">{taskStatusLabels.todo}</option>
                            <option value="doing">{taskStatusLabels.doing}</option>
                            <option value="blocked">{taskStatusLabels.blocked}</option>
                            <option value="done">{taskStatusLabels.done}</option>
                          </select>
                          {savingTaskId === task.id ? (
                            <p className="mt-1 text-[11px] font-semibold opacity-90">Guardando cambio...</p>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </aside>
      </section>

      {openedTask ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4"
          onClick={() => setOpenedTaskId("")}
        >
          <div
            className="w-full max-w-3xl rounded-3xl border border-[var(--line)] bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                  Tarea completa
                </p>
                <h3 className="mt-1 text-2xl font-semibold">{openedTask.title}</h3>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  {openedTask.code} · {activityTypeLabels[openedTask.activityType]}
                </p>
              </div>
              <button
                onClick={() => setOpenedTaskId("")}
                className="ui-btn ui-btn-secondary"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_0.9fr]">
              <section className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--background)]/55 p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                    Descripción
                  </p>
                  <p className="mt-2 text-sm text-[var(--foreground)]">
                    {openedTask.description?.trim().length
                      ? openedTask.description
                      : "Sin descripción registrada."}
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Proyecto</p>
                    <p className="mt-1 text-sm font-semibold">
                      {openedTaskProject
                        ? `${openedTaskProject.code} - ${openedTaskProject.name}`
                        : "Sin proyecto visible"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Relación</p>
                    <p className="mt-1 text-sm font-semibold">
                      {taskRelationLabels[getTaskRelation(openedTask, effectiveCalendarUserId)]}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Fecha compromiso</p>
                    <p className="mt-1 text-sm font-semibold">{openedTask.dueDate ?? "Sin fecha"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Horas estimadas</p>
                    <p className="mt-1 text-sm font-semibold">{openedTask.estimatedHours ?? "0"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Prioridad</p>
                    <p className="mt-1 text-sm font-semibold">{taskPriorityLabels[openedTask.priority]}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Responsable</p>
                    <p className="mt-1 text-sm font-semibold">
                      {openedTaskAssignee
                        ? `${openedTaskAssignee.fullName} (${roleLabels[openedTaskAssignee.role]})`
                        : "Sin asignar"}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                    Seguimiento de continuidad
                  </p>
                  {!openedTaskIsPrincipal ? (
                    <p className="mt-2 text-sm text-[var(--ink-muted)]">
                      Esta tarea forma parte del seguimiento de la principal: {openedTaskParent ? `${openedTaskParent.code} - ${openedTaskParent.title}` : openedTask?.parentTaskId}.
                    </p>
                  ) : openedConsequentTasks.length === 0 ? (
                    <p className="mt-2 text-sm text-[var(--ink-muted)]">
                      Esta tarea principal no tiene tareas consecuentes registradas.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {openedConsequentTasks.map((childTask) => {
                        const childAssignee = childTask.assigneeId
                          ? usersById[childTask.assigneeId]
                          : undefined;

                        return (
                          <div
                            key={childTask.id}
                            className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold">
                                {childTask.code} · {childTask.title}
                              </p>
                              <span className="rounded-full border border-cyan-200 bg-cyan-100 px-3 py-1 text-[11px] font-semibold text-cyan-800">
                                {taskStatusLabels[childTask.status]}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-[var(--ink-muted)]">
                              {activityTypeLabels[childTask.activityType]} · prioridad {taskPriorityLabels[childTask.priority]} · vence {childTask.dueDate ?? "sin fecha"}
                            </p>
                            <p className="mt-1 text-xs text-[var(--ink-muted)]">
                              Responsable: {childAssignee ? `${childAssignee.fullName} (${roleLabels[childAssignee.role]})` : "Sin asignar"}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>

              <section className="space-y-4 rounded-2xl border border-[var(--line)] bg-white p-4">
                {role === "manager" || role === "lead" ? (
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                      Reasignar responsable
                    </label>
                    <select
                      value={openedTask.assigneeId ?? ""}
                      onChange={(event) =>
                        void onUpdateTaskAssignee(openedTask.id, event.target.value)
                      }
                      disabled={savingTaskId === openedTask.id}
                      className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <option value="">Sin asignar</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.fullName} ({roleLabels[user.role]})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                    Cambiar estado
                  </label>
                  <select
                    value={openedTask.status}
                    onChange={(event) =>
                      void onUpdateTaskStatus(
                        openedTask.id,
                        event.target.value as TaskRow["status"],
                      )
                    }
                    disabled={savingTaskId === openedTask.id}
                    className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <option value="todo">{taskStatusLabels.todo}</option>
                    <option value="doing">{taskStatusLabels.doing}</option>
                    <option value="blocked">{taskStatusLabels.blocked}</option>
                    <option value="done">{taskStatusLabels.done}</option>
                  </select>
                </div>

                {savingTaskId === openedTask.id ? (
                  <p className="rounded-xl border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--ink-muted)]">
                    Guardando cambios...
                  </p>
                ) : null}

                <Link href="/tasks" className="ui-btn ui-btn-secondary">
                  Ir a tareas
                </Link>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}