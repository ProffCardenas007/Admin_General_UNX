"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL, authHeaders, getStoredEmail, getStoredRole, getStoredToken, getStoredUserId } from "../../lib/api";

type TaskRow = {
  id: string;
  code: string;
  activityType:
    | "revision"
    | "edicion"
    | "creacion"
    | "presentaciones"
    | "grabacion"
    | "plataforma";
  title: string;
  description?: string;
  projectId: string;
  assigneeId?: string;
  status: "todo" | "doing" | "blocked" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  dueDate?: string;
  estimatedHours: string;
};

type ProjectRow = {
  id: string;
  code: string;
  name: string;
};

type UserRow = {
  id: string;
  fullName: string;
  role: string;
};

type TaskUpdateRow = {
  id: string;
  taskId: string;
  userId: string;
  updateDate: string;
  workedHours: string;
  progressPercent: string;
  blockerReason?: string;
  comments?: string;
};

const statusLabels: Record<string, string> = {
  todo: "por hacer",
  doing: "en curso",
  blocked: "bloqueada",
  done: "finalizada",
};

const priorityLabels: Record<string, string> = {
  low: "baja",
  medium: "media",
  high: "alta",
  urgent: "urgente",
};

const activityTypeLabels: Record<string, string> = {
  revision: "revision",
  edicion: "edicion",
  creacion: "creacion",
  presentaciones: "presentaciones",
  grabacion: "grabacion",
  plataforma: "plataforma",
};

const roleLabels: Record<string, string> = {
  manager: "gerencia",
  lead: "líder",
  worker: "trabajador",
};

export default function TasksPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [savingTaskId, setSavingTaskId] = useState("");
  const [deletingTaskId, setDeletingTaskId] = useState("");
  const [loadingHistoryTaskId, setLoadingHistoryTaskId] = useState("");
  const [openedHistoryTaskId, setOpenedHistoryTaskId] = useState("");
  const [openedConsequenceTaskId, setOpenedConsequenceTaskId] = useState("");
  const [historyByTask, setHistoryByTask] = useState<Record<string, TaskUpdateRow[]>>({});
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");

  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [scopeFilter, setScopeFilter] = useState<"all" | "my" | "assigned">("all");
  const [dueFilter, setDueFilter] = useState<"all" | "soon" | "overdue">("all");

  const [taskDrafts, setTaskDrafts] = useState<
    Record<
      string,
      {
        status: TaskRow["status"];
        priority: TaskRow["priority"];
        assigneeId: string;
        handoffToUserId: string;
        handoffTitle: string;
        handoffMessage: string;
        nextActivityType: TaskRow["activityType"];
      }
    >
  >({});

  const loadData = async (currentRole: string, currentScope: "all" | "my" | "assigned") => {
    try {
      setLoading(true);
      const headers = authHeaders();

      const taskParams: Record<string, string> = {};
      if (currentRole === "manager") {
        if (currentScope === "my" && currentUserId) {
          taskParams.assigneeId = currentUserId;
        }
      } else if (currentRole === "lead") {
        taskParams.scope = currentScope === "assigned" ? "assigned" : "my";
      } else {
        taskParams.scope = "my";
      }

      const [tasksResult, projectsResult, usersResult] = await Promise.allSettled([
        axios.get(`${API_URL}/tasks`, { headers, params: taskParams }),
        axios.get(`${API_URL}/projects`, { headers }),
        axios.get(`${API_URL}/users`, { headers }),
      ]);

      if (tasksResult.status === "fulfilled") {
        const loadedTasks = tasksResult.value.data as TaskRow[];
        setTasks(loadedTasks);
        setTaskDrafts(
          Object.fromEntries(
            loadedTasks.map((task) => [
              task.id,
              {
                status: task.status,
                priority: task.priority,
                assigneeId: task.assigneeId ?? "",
                handoffToUserId: "",
                handoffTitle: "",
                handoffMessage: "",
                nextActivityType: task.activityType,
              },
            ]),
          ),
        );
      } else {
        throw new Error("No se pudo cargar la lista de tareas.");
      }

      if (projectsResult.status === "fulfilled") {
        setProjects(projectsResult.value.data as ProjectRow[]);
      }

      if (usersResult.status === "fulfilled") {
        setUsers(usersResult.value.data as UserRow[]);
      }
    } catch {
      setError("No se pudo cargar la vista de tareas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.replace("/");
      return;
    }

    const currentRole = getStoredRole();
    const currentUser = getStoredUserId();

    setEmail(getStoredEmail());
    setRole(currentRole);
    setCurrentUserId(currentUser);

    const params = new URLSearchParams(window.location.search);

    const requestedStatus = params.get("status");
    if (["todo", "doing", "blocked", "done"].includes(requestedStatus ?? "")) {
      setStatusFilter(requestedStatus ?? "");
    }

    const requestedPriority = params.get("priority");
    if (["low", "medium", "high", "urgent"].includes(requestedPriority ?? "")) {
      setPriorityFilter(requestedPriority ?? "");
    }

    const requestedScope = params.get("scope");
    if (currentRole === "manager") {
      setScopeFilter(requestedScope === "my" ? "my" : "all");
    } else if (currentRole === "lead") {
      setScopeFilter(requestedScope === "assigned" ? "assigned" : "my");
    } else {
      setScopeFilter("my");
    }

    const requestedDue = params.get("due");
    if (requestedDue === "soon" || requestedDue === "overdue") {
      setDueFilter(requestedDue);
    }
  }, [router]);

  useEffect(() => {
    if (!role) {
      return;
    }

    void loadData(role, scopeFilter);
  }, [role, scopeFilter, currentUserId]);

  const filteredTasks = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const soonLimit = new Date(today);
    soonLimit.setDate(soonLimit.getDate() + 3);

    return tasks.filter((task) => {
      const bySearch =
        search.trim().length === 0 ||
        task.code.toLowerCase().includes(search.toLowerCase()) ||
        task.title.toLowerCase().includes(search.toLowerCase());

      const byProject = projectFilter.length === 0 || task.projectId === projectFilter;
      const byStatus = statusFilter.length === 0 || task.status === statusFilter;
      const byPriority = priorityFilter.length === 0 || task.priority === priorityFilter;
      const byScope =
        role === "manager"
          ? (scopeFilter !== "my" || (currentUserId.length > 0 && task.assigneeId === currentUserId))
          : role === "lead"
            ? (scopeFilter === "my"
                ? currentUserId.length > 0 && task.assigneeId === currentUserId
                : currentUserId.length > 0 && task.assigneeId !== currentUserId)
            : (currentUserId.length > 0 && task.assigneeId === currentUserId);

      const dueDate = task.dueDate ? new Date(task.dueDate) : null;
      const byDue =
        dueFilter === "all" ||
        (dueFilter === "overdue" && task.status !== "done" && !!dueDate && dueDate < today) ||
        (dueFilter === "soon" &&
          task.status !== "done" &&
          !!dueDate &&
          dueDate >= today &&
          dueDate <= soonLimit);

      return bySearch && byProject && byStatus && byPriority && byScope && byDue;
    });
  }, [tasks, search, projectFilter, statusFilter, priorityFilter, scopeFilter, dueFilter, currentUserId, role]);

  const projectLabel = (projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    return project ? `${project.code} - ${project.name}` : projectId.slice(0, 8);
  };

  const assigneeLabel = (assigneeId?: string) => {
    if (!assigneeId) {
      return "Sin asignar";
    }

    const user = users.find((item) => item.id === assigneeId);
    return user
      ? `${user.fullName} (${roleLabels[user.role] ?? user.role})`
      : assigneeId.slice(0, 8);
  };

  const onSaveTaskQuickEdit = async (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    const draft = taskDrafts[taskId];

    if (!task || !draft) {
      return;
    }

    setInfo("");
    setError("");
    setSavingTaskId(taskId);

    try {
      const payload = {
        status: draft.status,
        priority: draft.priority,
        assigneeId: draft.assigneeId || undefined,
        handoffToUserId:
          draft.status === "done" && draft.handoffToUserId
            ? draft.handoffToUserId
            : undefined,
        nextTitle:
          draft.status === "done" && draft.handoffTitle.trim().length > 0
            ? draft.handoffTitle
            : undefined,
        handoffMessage:
          draft.status === "done" && draft.handoffMessage.trim().length > 0
            ? draft.handoffMessage
            : undefined,
        nextActivityType:
          draft.status === "done" && draft.handoffToUserId
            ? draft.nextActivityType
            : undefined,
      };

      const updated = await axios.patch(`${API_URL}/tasks/${taskId}`, payload, {
        headers: authHeaders(),
      });

      setTasks((current) =>
        current.map((item) =>
          item.id === taskId ? ({ ...item, ...(updated.data as TaskRow) } as TaskRow) : item,
        ),
      );
      setTaskDrafts((current) => ({
        ...current,
        [taskId]: {
          ...(current[taskId] ?? {
            status: task.status,
            priority: task.priority,
            assigneeId: task.assigneeId ?? "",
            handoffToUserId: "",
            handoffTitle: "",
            handoffMessage: "",
            nextActivityType: task.activityType,
          }),
          handoffToUserId: "",
          handoffTitle: "",
          handoffMessage: "",
        },
      }));
      setInfo(`Tarea ${task.code} actualizada.`);
    } catch {
      setError("No se pudo actualizar la tarea. Revisa permisos o estado de la sesión.");
    } finally {
      setSavingTaskId("");
    }
  };

  const onDeleteTask = async (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || role !== "manager") {
      return;
    }

    const confirmed = window.confirm(`Vas a borrar la tarea ${task.code}. Esta accion no se puede deshacer. Continuar?`);
    if (!confirmed) {
      return;
    }

    setInfo("");
    setError("");
    setDeletingTaskId(taskId);

    try {
      await axios.delete(`${API_URL}/tasks/${taskId}`, {
        headers: authHeaders(),
      });

      setTasks((current) => current.filter((item) => item.id !== taskId));
      setTaskDrafts((current) => {
        const next = { ...current };
        delete next[taskId];
        return next;
      });
      setHistoryByTask((current) =>
        Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${taskId}|`))),
      );
      if (openedHistoryTaskId === taskId) {
        setOpenedHistoryTaskId("");
      }
      if (openedConsequenceTaskId === taskId) {
        setOpenedConsequenceTaskId("");
      }
      setInfo(`Tarea ${task.code} eliminada.`);
    } catch {
      setError("No se pudo borrar la tarea. Esta accion es exclusiva de gerencia.");
    } finally {
      setDeletingTaskId("");
    }
  };

  const canPlanConsequence = role === "manager" || role === "lead";
  const consequenceTask = tasks.find((item) => item.id === openedConsequenceTaskId);
  const consequenceDraft = openedConsequenceTaskId
    ? taskDrafts[openedConsequenceTaskId]
    : undefined;
  const consequenceEnabled =
    consequenceTask && consequenceDraft
      ? (consequenceDraft.status ?? consequenceTask.status) === "done"
      : false;

  const scopeHelpText =
    role === "manager"
      ? "Gerencia puede alternar entre todas las asignaciones o solo sus tareas."
      : role === "lead"
        ? (scopeFilter === "assigned"
            ? "Viendo tareas encargadas a otros dentro de tu especialidad."
            : "Viendo tus tareas propias asignadas a tu usuario.")
        : "Solo puedes ver tus tareas propias.";

  const historyKey = (taskId: string, from: string, to: string) =>
    `${taskId}|${from || "_"}|${to || "_"}`;

  const loadHistory = async (taskId: string) => {
    const key = historyKey(taskId, historyFrom, historyTo);

    if (historyByTask[key]) {
      return;
    }

    setLoadingHistoryTaskId(taskId);
    try {
      const response = await axios.get(`${API_URL}/task-updates`, {
        headers: authHeaders(),
        params: {
          taskId,
          from: historyFrom || undefined,
          to: historyTo || undefined,
        },
      });

      setHistoryByTask((current) => ({
        ...current,
        [key]: response.data as TaskUpdateRow[],
      }));
    } catch {
      setError("No se pudo cargar el historial de la tarea.");
    } finally {
      setLoadingHistoryTaskId("");
    }
  };

  const onToggleHistory = async (taskId: string) => {
    if (openedHistoryTaskId === taskId) {
      setOpenedHistoryTaskId("");
      return;
    }

    setOpenedHistoryTaskId(taskId);
    await loadHistory(taskId);
  };

  const onApplyHistoryRange = async () => {
    if (!openedHistoryTaskId) {
      return;
    }

    if (historyFrom && historyTo && historyFrom > historyTo) {
      setError("El rango del historial es inválido: 'desde' no puede ser mayor que 'hasta'.");
      return;
    }

    setError("");
    await loadHistory(openedHistoryTaskId);
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <section className="glass-panel fade-up p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">
              Sistema de proyectos
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              Tareas individuales
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--ink-muted)] md:text-base">
              {email ? `Sesión activa como ${email}.` : "Sesión activa."} Aquí ves y filtras cada tarea creada.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold transition hover:bg-[var(--background)]"
            >
              Volver al panel
            </Link>
            <Link
              href="/users"
              className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold transition hover:bg-[var(--background)]"
            >
              Ver usuarios
            </Link>
            <Link
              href="/capture"
              className="rounded-full border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Cargar datos
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
            placeholder="Buscar por código o título"
          />
          <select
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
            className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
          >
            <option value="">Todos los proyectos</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.code} - {project.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
          >
            <option value="">Todos los estados</option>
            {[
              { value: "todo", label: "por hacer" },
              { value: "doing", label: "en curso" },
              { value: "blocked", label: "bloqueada" },
              { value: "done", label: "finalizada" },
            ].map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value)}
            className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
          >
            <option value="">Todas las prioridades</option>
            {[
              { value: "low", label: "baja" },
              { value: "medium", label: "media" },
              { value: "high", label: "alta" },
              { value: "urgent", label: "urgente" },
            ].map((priority) => (
              <option key={priority.value} value={priority.value}>
                {priority.label}
              </option>
            ))}
          </select>
          <select
            value={scopeFilter}
            onChange={(event) => setScopeFilter(event.target.value as "all" | "my" | "assigned")}
            disabled={role === "worker"}
            className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
          >
            {role === "manager" ? <option value="all">Todas las asignaciones</option> : null}
            {role === "lead" ? <option value="assigned">Tareas encargadas (mi especialidad)</option> : null}
            <option value="my">Tareas propias (asignadas a mi)</option>
          </select>
          <select
            value={dueFilter}
            onChange={(event) => setDueFilter(event.target.value as "all" | "soon" | "overdue")}
            className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
          >
            <option value="all">Todas las fechas</option>
            <option value="soon">Vencen pronto (3 dias)</option>
            <option value="overdue">Vencidas</option>
          </select>
        </div>
        <p className="mt-2 text-xs text-[var(--ink-muted)]">{scopeHelpText}</p>

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

        <div className="mt-5 flex flex-col gap-3 rounded-xl border border-[var(--line)] bg-white/70 p-4 md:flex-row md:items-end md:justify-between">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs text-[var(--ink-muted)]">
              Historial desde
              <input
                type="date"
                value={historyFrom}
                onChange={(event) => setHistoryFrom(event.target.value)}
                className="mt-1 block w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-[var(--ink-muted)]">
              Historial hasta
              <input
                type="date"
                value={historyTo}
                onChange={(event) => setHistoryTo(event.target.value)}
                className="mt-1 block w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
          <button
            onClick={() => void onApplyHistoryRange()}
            disabled={!openedHistoryTaskId || !!loadingHistoryTaskId}
            className="rounded-lg border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold transition hover:bg-[var(--background)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            Aplicar filtro al historial
          </button>
        </div>
      </section>

      <section className="kpi-card fade-up overflow-hidden p-0">
        {loading ? (
          <p className="p-5 text-sm text-[var(--ink-muted)]">Cargando tareas...</p>
        ) : filteredTasks.length === 0 ? (
          <p className="p-5 text-sm text-[var(--ink-muted)]">No hay tareas con esos filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--background)]/70 text-left">
                  <th className="px-4 py-3 font-semibold">Código</th>
                  <th className="px-4 py-3 font-semibold">Título</th>
                  <th className="px-4 py-3 font-semibold">Actividad</th>
                  <th className="px-4 py-3 font-semibold">Proyecto</th>
                  <th className="px-4 py-3 font-semibold">Asignado</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Prioridad</th>
                  <th className="px-4 py-3 font-semibold">Vence</th>
                  <th className="px-4 py-3 font-semibold">Horas est.</th>
                  <th className="px-4 py-3 font-semibold">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task) => (
                  <Fragment key={task.id}>
                    <tr className="border-b border-[var(--line)]/60 align-top">
                      <td className="px-4 py-3 font-mono text-xs">{task.code}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold">{task.title}</p>
                        {task.description ? (
                          <p className="mt-1 text-xs text-[var(--ink-muted)]">{task.description}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">{activityTypeLabels[task.activityType] ?? task.activityType}</td>
                      <td className="px-4 py-3">{projectLabel(task.projectId)}</td>
                      <td className="px-4 py-3">
                        <select
                          value={taskDrafts[task.id]?.assigneeId ?? ""}
                          onChange={(event) =>
                            setTaskDrafts((current) => ({
                              ...current,
                              [task.id]: {
                                ...current[task.id],
                                assigneeId: event.target.value,
                              },
                            }))
                          }
                          className="w-full min-w-[200px] rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs"
                        >
                          <option value="">Sin asignar</option>
                          {users.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.fullName} ({roleLabels[user.role] ?? user.role})
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-xs text-[var(--ink-muted)]">
                          Actual: {assigneeLabel(task.assigneeId)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={taskDrafts[task.id]?.status ?? task.status}
                          onChange={(event) =>
                            setTaskDrafts((current) => ({
                              ...current,
                              [task.id]: {
                                ...current[task.id],
                                status: event.target.value as TaskRow["status"],
                              },
                            }))
                          }
                          className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs"
                        >
                          <option value="todo">{statusLabels.todo}</option>
                          <option value="doing">{statusLabels.doing}</option>
                          <option value="blocked">{statusLabels.blocked}</option>
                          <option value="done">{statusLabels.done}</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={taskDrafts[task.id]?.priority ?? task.priority}
                          onChange={(event) =>
                            setTaskDrafts((current) => ({
                              ...current,
                              [task.id]: {
                                ...current[task.id],
                                priority: event.target.value as TaskRow["priority"],
                              },
                            }))
                          }
                          className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs"
                        >
                          <option value="low">{priorityLabels.low}</option>
                          <option value="medium">{priorityLabels.medium}</option>
                          <option value="high">{priorityLabels.high}</option>
                          <option value="urgent">{priorityLabels.urgent}</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">{task.dueDate ?? "-"}</td>
                      <td className="px-4 py-3">{task.estimatedHours}</td>
                      <td className="px-4 py-3 min-w-[270px]">
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => void onSaveTaskQuickEdit(task.id)}
                            disabled={savingTaskId === task.id}
                            className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {savingTaskId === task.id ? "Guardando..." : "Guardar"}
                          </button>
                          <button
                            onClick={() => void onToggleHistory(task.id)}
                            disabled={loadingHistoryTaskId === task.id}
                            className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-semibold transition hover:bg-[var(--background)] disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {loadingHistoryTaskId === task.id
                              ? "Cargando..."
                              : openedHistoryTaskId === task.id
                                ? "Ocultar historial"
                                : "Ver historial"}
                          </button>
                          {canPlanConsequence ? (
                            <button
                              onClick={() => setOpenedConsequenceTaskId(task.id)}
                              className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-semibold transition hover:bg-[var(--background)]"
                            >
                              Tarea consecuente
                            </button>
                          ) : null}
                          {role === "manager" ? (
                            <button
                              onClick={() => void onDeleteTask(task.id)}
                              disabled={deletingTaskId === task.id}
                              className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 py-2 text-xs font-semibold text-[var(--danger)] transition hover:bg-[var(--danger)]/20 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {deletingTaskId === task.id ? "Borrando..." : "Borrar"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>

                    {openedHistoryTaskId === task.id ? (
                      <tr className="border-b border-[var(--line)]/60">
                        <td colSpan={10} className="bg-[var(--background)]/35 px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                            Historial de updates
                          </p>
                          {historyByTask[historyKey(task.id, historyFrom, historyTo)] &&
                          historyByTask[historyKey(task.id, historyFrom, historyTo)].length > 0 ? (
                            <div className="mt-3 space-y-2">
                              {historyByTask[historyKey(task.id, historyFrom, historyTo)].map((item) => (
                                <div key={item.id} className="rounded-xl border border-[var(--line)] bg-white p-3">
                                  <div className="flex flex-wrap items-center gap-3 text-xs">
                                    <span className="font-mono">{item.updateDate}</span>
                                    <span>{Number(item.workedHours).toFixed(2)} h</span>
                                    <span>{Number(item.progressPercent).toFixed(0)}%</span>
                                    <span className="text-[var(--ink-muted)]">
                                      {assigneeLabel(item.userId)}
                                    </span>
                                  </div>
                                  {item.comments ? (
                                    <p className="mt-2 text-sm text-[var(--foreground)]">{item.comments}</p>
                                  ) : null}
                                  {item.blockerReason ? (
                                    <p className="mt-1 text-xs text-[var(--danger)]">
                                      Bloqueo: {item.blockerReason}
                                    </p>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-2 text-sm text-[var(--ink-muted)]">
                              Esta tarea no tiene updates todavía.
                            </p>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canPlanConsequence && consequenceTask && consequenceDraft ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4"
          onClick={() => setOpenedConsequenceTaskId("")}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-[var(--line)] bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                  Tarea consecuente
                </p>
                <h3 className="mt-1 text-lg font-semibold">{consequenceTask.title}</h3>
                <p className="text-xs text-[var(--ink-muted)]">{consequenceTask.code}</p>
              </div>
              <button
                onClick={() => setOpenedConsequenceTaskId("")}
                className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-semibold transition hover:bg-[var(--background)]"
              >
                Cerrar
              </button>
            </div>

            {!consequenceEnabled ? (
              <p className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--ink-muted)]">
                Marca esta tarea como finalizada para habilitar la continuidad.
              </p>
            ) : null}

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <select
                value={consequenceDraft.handoffToUserId}
                onChange={(event) =>
                  setTaskDrafts((current) => ({
                    ...current,
                    [consequenceTask.id]: {
                      ...current[consequenceTask.id],
                      handoffToUserId: event.target.value,
                    },
                  }))
                }
                className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                disabled={!consequenceEnabled}
              >
                <option value="">Mencionar responsable siguiente (opcional)</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName} ({roleLabels[user.role] ?? user.role})
                  </option>
                ))}
              </select>
              <select
                value={consequenceDraft.nextActivityType ?? consequenceTask.activityType}
                onChange={(event) =>
                  setTaskDrafts((current) => ({
                    ...current,
                    [consequenceTask.id]: {
                      ...current[consequenceTask.id],
                      nextActivityType: event.target.value as TaskRow["activityType"],
                    },
                  }))
                }
                className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                disabled={!consequenceEnabled}
              >
                <option value="revision">revision</option>
                <option value="edicion">edicion</option>
                <option value="creacion">creacion</option>
                <option value="presentaciones">presentaciones</option>
                <option value="grabacion">grabacion</option>
                <option value="plataforma">plataforma</option>
              </select>
            </div>

            <div className="mt-3 space-y-3">
              <input
                value={consequenceDraft.handoffTitle}
                onChange={(event) =>
                  setTaskDrafts((current) => ({
                    ...current,
                    [consequenceTask.id]: {
                      ...current[consequenceTask.id],
                      handoffTitle: event.target.value,
                    },
                  }))
                }
                className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                placeholder="Titulo de la tarea subsecuente"
                disabled={!consequenceEnabled}
              />
              <input
                value={consequenceDraft.handoffMessage}
                onChange={(event) =>
                  setTaskDrafts((current) => ({
                    ...current,
                    [consequenceTask.id]: {
                      ...current[consequenceTask.id],
                      handoffMessage: event.target.value,
                    },
                  }))
                }
                className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                placeholder="Mensaje para la actividad consecuente"
                disabled={!consequenceEnabled}
              />
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setOpenedConsequenceTaskId("")}
                className="rounded-lg border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold transition hover:bg-[var(--background)]"
              >
                Cerrar
              </button>
              <button
                onClick={() => void onSaveTaskQuickEdit(consequenceTask.id)}
                disabled={savingTaskId === consequenceTask.id}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {savingTaskId === consequenceTask.id ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}