"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { API_URL, authHeaders, getStoredEmail, getStoredRole, getStoredToken, getStoredUserId } from "../../lib/api";
import { specialtyLabels, type LeadSpecialty } from "../../lib/specialties";

type TaskRow = {
  id: string;
  code: string;
  parentTaskId?: string | null;
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
  createdBy?: string | null;
  status: "todo" | "doing" | "blocked" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  dueDate?: string;
  estimatedHours: string;
};

type ProjectRow = {
  id: string;
  code: string;
  name: string;
  scope?: LeadSpecialty | null;
  status?: "planned" | "active" | "on_hold" | "done" | "cancelled";
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
  worker: "colaborador",
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
  const [openedTrackingTaskId, setOpenedTrackingTaskId] = useState("");
  const [openedDescriptionTaskId, setOpenedDescriptionTaskId] = useState("");
  const [openedConsequenceTaskId, setOpenedConsequenceTaskId] = useState("");
  const [centerNoticeMessage, setCenterNoticeMessage] = useState("");
  const showCodeAndAssigneeColumns = role !== "worker";
  const isWorker = role === "worker";
  const canManagePlanning = role === "manager" || role === "lead";
  const [historyByTask, setHistoryByTask] = useState<Record<string, TaskUpdateRow[]>>({});
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");

  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [taskTypeFilter, setTaskTypeFilter] = useState<"all" | "principal">("all");
  const [showDoneTasks, setShowDoneTasks] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  const [taskDrafts, setTaskDrafts] = useState<
    Record<
      string,
      {
        status: TaskRow["status"];
        priority: TaskRow["priority"];
        assigneeId: string;
        description: string;
        dueDate: string;
        estimatedHours: string;
        handoffToUserId: string;
        handoffTitle: string;
        handoffMessage: string;
        nextActivityType: TaskRow["activityType"];
        nextDueDate: string;
        nextEstimatedHours: string;
      }
    >
  >({});

  const loadData = async (currentRole: string) => {
    try {
      setLoading(true);
      const headers = authHeaders();

      const [projectsResult, usersResult] = await Promise.allSettled([
        axios.get(`${API_URL}/projects`, { headers }),
        axios.get(`${API_URL}/users`, { headers }),
      ]);

      let loadedTasks: TaskRow[] = [];
      if (currentRole === "lead") {
        const [myTasksResponse, assignedTasksResponse] = await Promise.all([
          axios.get(`${API_URL}/tasks`, { headers, params: { scope: "my" } }),
          axios.get(`${API_URL}/tasks`, { headers, params: { scope: "assigned" } }),
        ]);

        const deduped = new Map<string, TaskRow>();
        [...(myTasksResponse.data as TaskRow[]), ...(assignedTasksResponse.data as TaskRow[])].forEach((task) => {
          deduped.set(task.id, task);
        });
        loadedTasks = [...deduped.values()];
      } else if (currentRole === "worker") {
        const myTasksResponse = await axios.get(`${API_URL}/tasks`, { headers, params: { scope: "my" } });
        loadedTasks = myTasksResponse.data as TaskRow[];
      } else {
        const tasksResponse = await axios.get(`${API_URL}/tasks`, { headers });
        loadedTasks = tasksResponse.data as TaskRow[];
      }

      setTasks(loadedTasks);
      setTaskDrafts(
        Object.fromEntries(
          loadedTasks.map((task) => [
            task.id,
            {
              status: task.status,
              priority: task.priority,
              assigneeId: task.assigneeId ?? "",
              description: task.description ?? "",
              dueDate: task.dueDate ?? "",
              estimatedHours: task.estimatedHours ?? "",
              handoffToUserId: "",
              handoffTitle: "",
              handoffMessage: "",
              nextActivityType: task.activityType,
              nextDueDate: task.dueDate ?? "",
              nextEstimatedHours: task.estimatedHours ?? "",
            },
          ]),
        ),
      );

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

  }, [router]);

  useEffect(() => {
    if (!role) {
      return;
    }

    void loadData(role);
  }, [role, currentUserId]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const projectIdFromQuery = query.get("projectId") ?? "";
    const showDoneFromQuery = query.get("showDone") === "1";

    if (projectIdFromQuery.length > 0) {
      setProjectFilter(projectIdFromQuery);
    }

    if (showDoneFromQuery) {
      setShowDoneTasks(true);
    }
  }, []);

  useEffect(() => {
    if (!centerNoticeMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCenterNoticeMessage("");
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [centerNoticeMessage]);

  const filteredTasks = useMemo(() => {
    const result = tasks.filter((task) => {
      const bySearch =
        search.trim().length === 0 ||
        task.code.toLowerCase().includes(search.toLowerCase()) ||
        task.title.toLowerCase().includes(search.toLowerCase());

      const byProject = projectFilter.length === 0 || task.projectId === projectFilter;

      const byAssignee =
        assigneeFilter.length === 0 || (task.assigneeId ?? "") === assigneeFilter;

      const byTaskType =
        !canManagePlanning ||
        taskTypeFilter === "all" ||
        !task.parentTaskId;

      const byDoneStatus = showDoneTasks || task.status !== "done";

      return bySearch && byProject && byAssignee && byTaskType && byDoneStatus;
    });

    return result.sort((a, b) => Number(a.status === "done") - Number(b.status === "done"));
  }, [
    tasks,
    search,
    projectFilter,
    assigneeFilter,
    canManagePlanning,
    taskTypeFilter,
    showDoneTasks,
  ]);

  const activeProjects = useMemo(
    () => projects.filter((project) => project.status === "active"),
    [projects],
  );

  const projectById = useMemo(
    () => Object.fromEntries(projects.map((project) => [project.id, project])),
    [projects],
  );

  const taskById = useMemo(
    () => Object.fromEntries(tasks.map((task) => [task.id, task])),
    [tasks],
  );

  const consequentTasksByParent = useMemo(() => {
    return tasks.reduce<Record<string, TaskRow[]>>((accumulator, task) => {
      if (!task.parentTaskId) {
        return accumulator;
      }

      if (!accumulator[task.parentTaskId]) {
        accumulator[task.parentTaskId] = [];
      }

      accumulator[task.parentTaskId].push(task);
      accumulator[task.parentTaskId].sort((left, right) => {
        const leftDate = left.dueDate ?? "9999-12-31";
        const rightDate = right.dueDate ?? "9999-12-31";
        return leftDate.localeCompare(rightDate) || left.code.localeCompare(right.code);
      });
      return accumulator;
    }, {});
  }, [tasks]);

  const todayIso = useMemo(() => {
    const now = new Date();
    const month = `${now.getMonth() + 1}`.padStart(2, "0");
    const day = `${now.getDate()}`.padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
  }, []);

  const tomorrowIso = useMemo(() => {
    const todayDate = new Date(`${todayIso}T00:00:00`);
    todayDate.setDate(todayDate.getDate() + 1);
    const month = `${todayDate.getMonth() + 1}`.padStart(2, "0");
    const day = `${todayDate.getDate()}`.padStart(2, "0");
    return `${todayDate.getFullYear()}-${month}-${day}`;
  }, [todayIso]);

  const workerDisplayName = useMemo(() => {
    if (!email) {
      return "";
    }
    return email.split("@")[0];
  }, [email]);

  const workerHeaderDate = useMemo(
    () =>
      new Intl.DateTimeFormat("es-MX", {
        weekday: "long",
        day: "2-digit",
        month: "long",
      }).format(new Date()),
    [],
  );

  const getUrgencyScore = (task: TaskRow) => {
    if (task.status === "done") {
      return -1000;
    }
    if (task.status === "blocked") {
      return 500;
    }
    if (!task.dueDate) {
      return task.priority === "urgent" ? 320 : 150;
    }

    const dueDate = new Date(`${task.dueDate}T23:59:59`);
    const todayDate = new Date(`${todayIso}T00:00:00`);
    const daysLeft = Math.ceil((dueDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) {
      return 450 + Math.abs(daysLeft);
    }
    if (daysLeft === 0) {
      return 420;
    }
    if (daysLeft <= 2) {
      return 360 - daysLeft * 10;
    }
    return 220 - daysLeft;
  };

  const workerKpis = useMemo(() => {
    const total = filteredTasks.length;
    const done = filteredTasks.filter((task) => task.status === "done").length;
    const doing = filteredTasks.filter((task) => task.status === "doing").length;
    const blocked = filteredTasks.filter((task) => task.status === "blocked").length;
    const dueToday = filteredTasks.filter((task) => task.status !== "done" && task.dueDate === todayIso).length;
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;

    return {
      total,
      done,
      doing,
      blocked,
      dueToday,
      progress,
      active: total - done,
    };
  }, [filteredTasks, todayIso]);

  const workerPriorityTasks = useMemo(() => {
    return filteredTasks
      .filter((task) => task.status !== "done")
      .slice()
      .sort((a, b) => getUrgencyScore(b) - getUrgencyScore(a))
      .slice(0, 4);
  }, [filteredTasks, todayIso]);

  const workerTimeline = useMemo(() => {
    const active = filteredTasks
      .filter((task) => task.status !== "done" && !!task.dueDate)
      .slice();

    const overdue = active
      .filter((task) => (task.dueDate ?? "") < todayIso)
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

    const today = active
      .filter((task) => task.dueDate === todayIso)
      .sort((a, b) => getUrgencyScore(b) - getUrgencyScore(a));

    const tomorrow = active
      .filter((task) => task.dueDate === tomorrowIso)
      .sort((a, b) => getUrgencyScore(b) - getUrgencyScore(a));

    return {
      overdue,
      today,
      tomorrow,
    };
  }, [filteredTasks, todayIso, tomorrowIso]);

  const displayTasks = useMemo(() => {
    const base = focusMode
      ? filteredTasks.filter((task) => task.status !== "done")
      : filteredTasks;

    return base
      .slice()
      .sort((a, b) => getUrgencyScore(b) - getUrgencyScore(a));
  }, [filteredTasks, focusMode, todayIso]);

  const taskDueSemaforo = (task: TaskRow) => {
    if (task.status === "done") {
      return {
        label: "Finalizada",
        dotClass: "bg-emerald-500",
        textClass: "text-emerald-600",
      };
    }

    if (!task.dueDate) {
      return {
        label: "Sin fecha",
        dotClass: "bg-slate-400",
        textClass: "text-slate-600",
      };
    }

    const today = new Date();
    const dueDate = new Date(`${task.dueDate}T23:59:59`);
    const dayMs = 1000 * 60 * 60 * 24;
    const daysLeft = Math.ceil((dueDate.getTime() - today.getTime()) / dayMs);

    if (daysLeft < 0) {
      return {
        label: `Atrasada (${Math.abs(daysLeft)}d)`,
        dotClass: "bg-red-500",
        textClass: "text-red-600",
      };
    }

    if (daysLeft <= 2) {
      return {
        label: `Crítica (${daysLeft}d)`,
        dotClass: "bg-red-500",
        textClass: "text-red-600",
      };
    }

    if (daysLeft <= 5) {
      return {
        label: `Atención (${daysLeft}d)`,
        dotClass: "bg-amber-500",
        textClass: "text-amber-600",
      };
    }

    return {
      label: `En tiempo (${daysLeft}d)`,
      dotClass: "bg-emerald-500",
      textClass: "text-emerald-600",
    };
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

  const projectLabel = (projectId: string) => {
    const project = projectById[projectId];
    if (!project) {
      return "Proyecto no encontrado";
    }

    const specialty = project.scope ? specialtyLabels[project.scope] : "Sin especialidad";
    return `${project.code} · ${project.name} · ${specialty}`;
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
      const willCreateConsequentTask =
        draft.status === "done" && draft.handoffToUserId.trim().length > 0;

      const payload = {
        status: draft.status,
        priority: draft.priority,
        assigneeId: draft.assigneeId || undefined,
        description: canManagePlanning ? draft.description || undefined : undefined,
        dueDate: canManagePlanning ? draft.dueDate || undefined : undefined,
        estimatedHours:
          canManagePlanning && draft.estimatedHours.trim().length > 0
            ? Number(draft.estimatedHours)
            : undefined,
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
        nextDueDate:
          draft.status === "done" && draft.handoffToUserId && draft.nextDueDate.trim().length > 0
            ? draft.nextDueDate
            : undefined,
        nextEstimatedHours:
          draft.status === "done" && draft.handoffToUserId && draft.nextEstimatedHours.trim().length > 0
            ? Number(draft.nextEstimatedHours)
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
            description: task.description ?? "",
            dueDate: task.dueDate ?? "",
            estimatedHours: task.estimatedHours ?? "",
            handoffToUserId: "",
            handoffTitle: "",
            handoffMessage: "",
            nextActivityType: task.activityType,
            nextDueDate: task.dueDate ?? "",
            nextEstimatedHours: task.estimatedHours ?? "",
          }),
          handoffToUserId: "",
          handoffTitle: "",
          handoffMessage: "",
          nextDueDate: "",
          nextEstimatedHours: task.estimatedHours ?? "",
        },
      }));

      if (willCreateConsequentTask) {
        setOpenedConsequenceTaskId("");
        setOpenedTrackingTaskId("");

        if (role) {
          await loadData(role);
        }

        setCenterNoticeMessage("Tarea consecuente creada correctamente.");
      }

      setInfo(`Tarea ${task.code} actualizada.`);
    } catch {
      setError("No se pudo actualizar la tarea. Revisa permisos o estado de la sesión.");
    } finally {
      setSavingTaskId("");
    }
  };

  const onDeleteTask = async (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }

    const canDeleteTask = role === "manager" || task.createdBy === currentUserId;
    if (!canDeleteTask) {
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
      if (openedTrackingTaskId === taskId) {
        setOpenedTrackingTaskId("");
      }
      if (openedConsequenceTaskId === taskId) {
        setOpenedConsequenceTaskId("");
      }
      setInfo(`Tarea ${task.code} eliminada.`);
    } catch {
      setError("No se pudo borrar la tarea. Solo gerencia o quien la creo puede hacerlo.");
    } finally {
      setDeletingTaskId("");
    }
  };

  const canPlanConsequence = role === "manager" || role === "lead" || role === "worker";
  const consequenceTask = tasks.find((item) => item.id === openedConsequenceTaskId);
  const consequenceDraft = openedConsequenceTaskId
    ? taskDrafts[openedConsequenceTaskId]
    : undefined;
  const consequenceEnabled =
    consequenceTask && consequenceDraft
      ? (consequenceDraft.status ?? consequenceTask.status) === "done"
      : false;

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

  const onOpenTaskFromTimeline = (taskId: string, target: "description" | "history") => {
    if (target === "description") {
      setOpenedDescriptionTaskId(taskId);
      return;
    }

    setOpenedHistoryTaskId(taskId);
    void loadHistory(taskId);
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
              {isWorker ? "Mis tareas" : "Tareas individuales"}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-[var(--ink-muted)] md:text-base">
              {isWorker
                ? "Gestiona y actualiza tus tareas asignadas."
                : "Vista y filtrado detallado de todas las tareas."}
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-[var(--line)] bg-gradient-to-r from-white via-[var(--background)] to-white p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                  {isWorker ? "Mi jornada" : "Vista operativa"}
                </p>
                <p className="mt-1 text-lg font-semibold capitalize">
                  {workerDisplayName ? `Hola, ${workerDisplayName}` : "Hola"}
                </p>
                <p className="text-sm text-[var(--ink-muted)]">{workerHeaderDate}</p>
              </div>
              <button
                onClick={() => setFocusMode((current) => !current)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  focusMode
                    ? "border border-[var(--accent)] bg-[var(--accent)] text-white"
                    : "border border-[var(--line)] bg-white text-[var(--foreground)] hover:bg-[var(--background)]"
                }`}
              >
                {focusMode ? "Modo enfoque activo" : "Activar modo enfoque"}
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-[var(--line)] bg-white p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">Pendientes</p>
                <p className="mt-1 text-2xl font-semibold">{workerKpis.active}</p>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-white p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">En curso</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--accent)]">{workerKpis.doing}</p>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-white p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">Bloqueadas</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--danger)]">{workerKpis.blocked}</p>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-white p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">Vencen hoy</p>
                <p className="mt-1 text-2xl font-semibold text-amber-700">{workerKpis.dueToday}</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-[var(--line)] bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Avance personal</p>
                <p className="text-xs text-[var(--ink-muted)]">
                  {workerKpis.done}/{workerKpis.total} finalizadas
                </p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--background)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-all"
                  style={{ width: `${workerKpis.progress}%` }}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {workerPriorityTasks.length === 0 ? (
                <p className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--ink-muted)] md:col-span-2">
                  Excelente, no tienes tareas activas con los filtros actuales.
                </p>
              ) : (
                workerPriorityTasks.map((task) => {
                  const due = taskDueSemaforo(task);
                  return (
                    <div key={task.id} className="rounded-xl border border-[var(--line)] bg-white p-3">
                      <p className="text-sm font-semibold">{task.title}</p>
                      <p className="mt-1 text-xs text-[var(--ink-muted)]">
                        {activityTypeLabels[task.activityType] ?? task.activityType} · {priorityLabels[task.priority]}
                      </p>
                      <p className={`mt-2 text-xs font-semibold ${due.textClass}`}>{due.label}</p>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-4 rounded-xl border border-[var(--line)] bg-white p-3">
              <p className="text-sm font-semibold">Línea de tiempo rápida</p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-red-100 bg-red-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-700">
                    Atrasadas ({workerTimeline.overdue.length})
                  </p>
                  <div className="mt-2 space-y-1">
                    {workerTimeline.overdue.slice(0, 3).map((task) => (
                      <div key={task.id} className="flex items-center justify-between gap-2">
                        <button
                          onClick={() => onOpenTaskFromTimeline(task.id, "description")}
                          className="text-left text-xs font-semibold text-red-700 underline-offset-2 hover:underline"
                        >
                          {task.title}
                        </button>
                        <button
                          onClick={() => onOpenTaskFromTimeline(task.id, "history")}
                          className="text-[11px] text-red-700/80 underline-offset-2 hover:underline"
                        >
                          Historial
                        </button>
                      </div>
                    ))}
                    {workerTimeline.overdue.length === 0 ? (
                      <p className="text-xs text-red-700/70">Sin tareas atrasadas.</p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">
                    Hoy ({workerTimeline.today.length})
                  </p>
                  <div className="mt-2 space-y-1">
                    {workerTimeline.today.slice(0, 3).map((task) => (
                      <div key={task.id} className="flex items-center justify-between gap-2">
                        <button
                          onClick={() => onOpenTaskFromTimeline(task.id, "description")}
                          className="text-left text-xs font-semibold text-amber-800 underline-offset-2 hover:underline"
                        >
                          {task.title}
                        </button>
                        <button
                          onClick={() => onOpenTaskFromTimeline(task.id, "history")}
                          className="text-[11px] text-amber-800/80 underline-offset-2 hover:underline"
                        >
                          Historial
                        </button>
                      </div>
                    ))}
                    {workerTimeline.today.length === 0 ? (
                      <p className="text-xs text-amber-800/70">Sin vencimientos para hoy.</p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
                    Mañana ({workerTimeline.tomorrow.length})
                  </p>
                  <div className="mt-2 space-y-1">
                    {workerTimeline.tomorrow.slice(0, 3).map((task) => (
                      <div key={task.id} className="flex items-center justify-between gap-2">
                        <button
                          onClick={() => onOpenTaskFromTimeline(task.id, "description")}
                          className="text-left text-xs font-semibold text-emerald-700 underline-offset-2 hover:underline"
                        >
                          {task.title}
                        </button>
                        <button
                          onClick={() => onOpenTaskFromTimeline(task.id, "history")}
                          className="text-[11px] text-emerald-700/80 underline-offset-2 hover:underline"
                        >
                          Historial
                        </button>
                      </div>
                    ))}
                    {workerTimeline.tomorrow.length === 0 ? (
                      <p className="text-xs text-emerald-700/70">Sin tareas programadas.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>

        <div className={`mt-6 grid gap-3 ${canManagePlanning ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="ui-control"
            placeholder="Buscar tarea"
          />
          <select
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
            className="ui-control"
          >
            <option value="">Todos los proyectos activos</option>
            {activeProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.code} - {project.name}
              </option>
            ))}
          </select>
          <select
            value={assigneeFilter}
            onChange={(event) => setAssigneeFilter(event.target.value)}
            className="ui-control"
          >
            <option value="">Todos los usuarios</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.fullName} ({roleLabels[user.role] ?? user.role})
              </option>
            ))}
          </select>
          {canManagePlanning ? (
            <select
              value={taskTypeFilter}
              onChange={(event) =>
                setTaskTypeFilter(event.target.value as "all" | "principal")
              }
              className="ui-control"
            >
              <option value="all">Todas las tareas</option>
              <option value="principal">Solo tareas principales</option>
            </select>
          ) : null}
        </div>

        <div className="mt-3">
          <label className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-[var(--foreground)]">
            <input
              type="checkbox"
              checked={showDoneTasks}
              onChange={(event) => setShowDoneTasks(event.target.checked)}
            />
            Mostrar tareas finalizadas
          </label>
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
            className="ui-btn ui-btn-secondary disabled:cursor-not-allowed disabled:opacity-70"
          >
            Aplicar filtro al historial
          </button>
        </div>
      </section>

      <section className="kpi-card fade-up overflow-hidden p-0">
        {loading ? (
          <div className="p-5">
            <div className="ui-skeleton h-6 w-40" />
          </div>
        ) : displayTasks.length === 0 ? (
          <p className="ui-empty m-4 px-4 py-3 text-sm">No hay tareas con esos filtros.</p>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <table className="ui-table min-w-full w-full">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--background)]/70 text-left">
                  <th className="px-4 py-3 font-semibold">Título</th>
                  <th className="px-4 py-3 font-semibold hidden xl:table-cell">Actividad</th>
                  {showCodeAndAssigneeColumns ? <th className="px-4 py-3 font-semibold">Asignado</th> : null}
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold hidden xl:table-cell">Prioridad</th>
                  <th className="px-4 py-3 font-semibold">Semáforo</th>
                  <th className="px-4 py-3 font-semibold">Acción</th>
                </tr>
              </thead>
              <tbody>
                {displayTasks.map((task) => {
                  const due = taskDueSemaforo(task);
                  const canDeleteTask = role === "manager" || task.createdBy === currentUserId;
                  const consequentTasks = consequentTasksByParent[task.id] ?? [];
                  const parentTask = task.parentTaskId ? taskById[task.parentTaskId] : undefined;
                  const parentActivityLabel = parentTask
                    ? activityTypeLabels[parentTask.activityType] ?? parentTask.activityType
                    : "actividad";
                  const isPrincipalTask = !task.parentTaskId;
                  return (
                    <Fragment key={task.id}>
                      <tr className="border-b border-[var(--line)]/60 align-top">
                        <td className="px-4 py-3 break-words">
                          <p className="font-semibold break-words">{task.title}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                            {projectLabel(task.projectId)}
                          </p>
                          {!isPrincipalTask ? (
                            <p className="mt-1 text-[11px] font-semibold text-[var(--accent)]">
                              Seguimiento de {parentActivityLabel} de {parentTask ? parentTask.title : "tarea principal"}
                            </p>
                          ) : null}
                          {canManagePlanning ? (
                            <label className="mt-2 block text-xs text-[var(--ink-muted)]">
                              Descripción
                              <textarea
                                value={taskDrafts[task.id]?.description ?? task.description ?? ""}
                                onChange={(event) =>
                                  setTaskDrafts((current) => ({
                                    ...current,
                                    [task.id]: {
                                      ...current[task.id],
                                      description: event.target.value,
                                    },
                                  }))
                                }
                                rows={2}
                                className="mt-1 block w-full max-w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs md:min-w-[220px]"
                              />
                            </label>
                          ) : null}
                          {task.description ? (
                            <>
                              <button
                                onClick={() =>
                                  setOpenedDescriptionTaskId((current) =>
                                    current === task.id ? "" : task.id,
                                  )
                                }
                                className="ui-btn ui-btn-secondary ui-btn-sm mt-1"
                              >
                                {openedDescriptionTaskId === task.id
                                  ? "Ocultar descripción"
                                  : "Ver descripción"}
                              </button>
                              {openedDescriptionTaskId === task.id ? (
                                <p className="mt-2 text-xs text-[var(--ink-muted)]">{task.description}</p>
                              ) : null}
                            </>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 hidden xl:table-cell">{activityTypeLabels[task.activityType] ?? task.activityType}</td>
                        {showCodeAndAssigneeColumns ? (
                          <td className="px-4 py-3 whitespace-normal break-words">
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
                              className="w-full max-w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs md:min-w-[200px]"
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
                        ) : null}
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
                        <td className="px-4 py-3 hidden xl:table-cell">
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
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-2 text-xs font-semibold ${due.textClass}`}>
                            <span className={`h-2.5 w-2.5 rounded-full ${due.dotClass}`} />
                            {due.label}
                          </span>
                          <p className="mt-2 text-xs text-[var(--ink-muted)]">
                            Horas estimadas actuales: {task.estimatedHours ?? "0"}
                          </p>
                          {canManagePlanning ? (
                            <label className="mt-2 block text-xs text-[var(--ink-muted)]">
                              Fecha fin
                              <input
                                type="date"
                                value={taskDrafts[task.id]?.dueDate ?? task.dueDate ?? ""}
                                onChange={(event) =>
                                  setTaskDrafts((current) => ({
                                    ...current,
                                    [task.id]: {
                                      ...current[task.id],
                                      dueDate: event.target.value,
                                    },
                                  }))
                                }
                                className="mt-1 block w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs"
                              />
                            </label>
                          ) : null}
                          {canManagePlanning ? (
                            <label className="mt-2 block text-xs text-[var(--ink-muted)]">
                              Horas estimadas
                              <input
                                type="number"
                                min="0"
                                step="0.25"
                                value={taskDrafts[task.id]?.estimatedHours ?? task.estimatedHours ?? ""}
                                onChange={(event) =>
                                  setTaskDrafts((current) => ({
                                    ...current,
                                    [task.id]: {
                                      ...current[task.id],
                                      estimatedHours: event.target.value,
                                    },
                                  }))
                                }
                                className="mt-1 block w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs"
                              />
                            </label>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 md:min-w-[220px]">
                          <div className="grid gap-2 lg:grid-cols-2">
                            <button
                              onClick={() => void onSaveTaskQuickEdit(task.id)}
                              disabled={savingTaskId === task.id}
                              className="ui-btn ui-btn-primary ui-btn-sm disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {savingTaskId === task.id ? "Guardando..." : "Guardar"}
                            </button>
                            <button
                              onClick={() => void onToggleHistory(task.id)}
                              disabled={loadingHistoryTaskId === task.id}
                              className="ui-btn ui-btn-secondary ui-btn-sm disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {loadingHistoryTaskId === task.id
                                ? "Cargando..."
                                : openedHistoryTaskId === task.id
                                  ? "Ocultar historial"
                                  : "Ver historial"}
                            </button>
                            {canPlanConsequence && isPrincipalTask ? (
                              <button
                                onClick={() =>
                                  setOpenedTrackingTaskId((current) =>
                                    current === task.id ? "" : task.id,
                                  )
                                }
                                className="ui-btn ui-btn-secondary ui-btn-sm"
                              >
                                {openedTrackingTaskId === task.id
                                  ? "Ocultar seguimiento"
                                  : `Seguimiento (${consequentTasks.length})`}
                              </button>
                            ) : null}
                            {canPlanConsequence ? (
                              <button
                                onClick={() => {
                                  setTaskDrafts((current) => ({
                                    ...current,
                                    [task.id]: {
                                      ...current[task.id],
                                      status: "done",
                                    },
                                  }));
                                  setOpenedConsequenceTaskId(task.id);
                                }}
                                className="ui-btn ui-btn-secondary ui-btn-sm"
                              >
                                Tarea consecuente
                              </button>
                            ) : null}
                            {canDeleteTask ? (
                              <button
                                onClick={() => void onDeleteTask(task.id)}
                                disabled={deletingTaskId === task.id}
                                className="ui-btn ui-btn-danger ui-btn-sm disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                {deletingTaskId === task.id ? "Borrando..." : "Borrar"}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>

                      {openedHistoryTaskId === task.id ? (
                        <tr className="border-b border-[var(--line)]/60">
                          <td colSpan={showCodeAndAssigneeColumns ? 7 : 6} className="bg-[var(--background)]/35 px-4 py-3">
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

                      {isPrincipalTask && openedTrackingTaskId === task.id ? (
                        <tr className="border-b border-[var(--line)]/60">
                          <td colSpan={showCodeAndAssigneeColumns ? 7 : 6} className="bg-[var(--background)]/35 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                              Seguimiento de continuidad
                            </p>
                            {consequentTasks.length > 0 ? (
                              <div className="mt-3 space-y-2">
                                {consequentTasks.map((childTask) => (
                                  <div key={childTask.id} className="rounded-xl border border-[var(--line)] bg-white p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                                      <span className="font-semibold text-[var(--foreground)]">
                                        {childTask.code} · {childTask.title}
                                      </span>
                                      <span className="rounded-full border border-cyan-200 bg-cyan-100 px-3 py-1 font-semibold text-cyan-800">
                                        {statusLabels[childTask.status] ?? childTask.status}
                                      </span>
                                    </div>
                                    <p className="mt-2 text-xs text-[var(--ink-muted)]">
                                      {activityTypeLabels[childTask.activityType] ?? childTask.activityType} · prioridad {priorityLabels[childTask.priority] ?? childTask.priority} · fecha fin {childTask.dueDate ?? "-"}
                                    </p>
                                    <p className="mt-1 text-xs text-[var(--ink-muted)]">
                                      Responsable: {assigneeLabel(childTask.assigneeId)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-2 text-sm text-[var(--ink-muted)]">
                                Esta tarea principal no tiene tareas consecuentes registradas.
                              </p>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {centerNoticeMessage ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/35 px-4">
          <div className="w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-5 text-center shadow-2xl">
            <p className="text-sm uppercase tracking-[0.12em] text-emerald-700">Confirmacion</p>
            <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">{centerNoticeMessage}</p>
            <button
              type="button"
              onClick={() => setCenterNoticeMessage("")}
              className="ui-btn ui-btn-primary ui-btn-sm mt-4"
            >
              Entendido
            </button>
          </div>
        </div>
      ) : null}

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
                className="ui-btn ui-btn-secondary ui-btn-sm"
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
              <input
                type="date"
                value={consequenceDraft.nextDueDate ?? consequenceTask.dueDate ?? ""}
                onChange={(event) =>
                  setTaskDrafts((current) => ({
                    ...current,
                    [consequenceTask.id]: {
                      ...current[consequenceTask.id],
                      nextDueDate: event.target.value,
                    },
                  }))
                }
                className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                disabled={!consequenceEnabled}
              />
              <label className="text-xs text-[var(--ink-muted)]">
                Horas estimadas (tarea consecuente)
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={consequenceDraft.nextEstimatedHours ?? consequenceTask.estimatedHours ?? ""}
                  onChange={(event) =>
                    setTaskDrafts((current) => ({
                      ...current,
                      [consequenceTask.id]: {
                        ...current[consequenceTask.id],
                        nextEstimatedHours: event.target.value,
                      },
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                  placeholder="0"
                  disabled={!consequenceEnabled}
                />
              </label>
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
                className="ui-btn ui-btn-secondary"
              >
                Cerrar
              </button>
              <button
                onClick={() => void onSaveTaskQuickEdit(consequenceTask.id)}
                disabled={savingTaskId === consequenceTask.id}
                className="ui-btn ui-btn-primary disabled:cursor-not-allowed disabled:opacity-70"
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