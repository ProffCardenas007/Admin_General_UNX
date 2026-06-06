"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API_URL, authHeaders, getStoredEmail, getStoredRole, getStoredToken, getStoredUserId } from "../../lib/api";
import { specialtyLabels, type LeadSpecialty } from "../../lib/specialties";

type Summary = {
  activeProjects: number;
  completionRate: number;
  overdueTasks: number;
  blockedTasks: number;
  hoursWorked: number;
};

type WorkloadRow = {
  userId: string;
  hoursWorked: string;
  updatesCount: string;
};

type TrendRow = {
  weekStart: string;
  hoursWorked: string;
  updatesCount: string;
};

type TaskRow = {
  id: string;
  projectId: string;
  activityType: "revision" | "edicion" | "creacion" | "presentaciones" | "grabacion" | "plataforma";
  title: string;
  description?: string;
  assigneeId?: string;
  status: "todo" | "doing" | "blocked" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  dueDate?: string;
  estimatedHours?: string;
};

type ProjectRow = {
  id: string;
  code: string;
  name: string;
  scope?: LeadSpecialty | null;
  status: "planned" | "active" | "on_hold" | "done" | "cancelled";
  startDate?: string;
  endDate?: string;
};

type UserOption = {
  id: string;
  fullName: string;
  role: "manager" | "lead" | "worker";
};

type ProjectProgress = {
  projectId: string;
  totalTasks: number;
  doneTasks: number;
  completionRate: number;
  overdueTasks: number;
};

type RiskLevel = "green" | "amber" | "red";

const projectStatusLabels: Record<ProjectRow["status"], string> = {
  planned: "planificado",
  active: "activo",
  on_hold: "en pausa",
  done: "finalizado",
  cancelled: "cancelado",
};

const riskLabelMap: Record<RiskLevel, string> = {
  green: "estable",
  amber: "en seguimiento",
  red: "en riesgo",
};

const activityTypeOptions = [
  { value: "revision", label: "revision" },
  { value: "edicion", label: "edicion" },
  { value: "creacion", label: "creacion" },
  { value: "presentaciones", label: "presentaciones" },
  { value: "grabacion", label: "grabacion" },
  { value: "plataforma", label: "plataforma" },
] as const;

const taskStatusOptions = [
  { value: "todo", label: "por hacer" },
  { value: "doing", label: "en curso" },
  { value: "blocked", label: "bloqueada" },
  { value: "done", label: "finalizada" },
] as const;

const taskStatusLabels: Record<TaskRow["status"], string> = {
  todo: "por hacer",
  doing: "en curso",
  blocked: "bloqueada",
  done: "finalizada",
};

const priorityOptions = [
  { value: "low", label: "baja" },
  { value: "medium", label: "media" },
  { value: "high", label: "alta" },
  { value: "urgent", label: "urgente" },
] as const;

const taskPriorityLabels: Record<TaskRow["priority"], string> = {
  low: "baja",
  medium: "media",
  high: "alta",
  urgent: "urgente",
};

const roleLabels: Record<UserOption["role"], string> = {
  manager: "gerencia",
  lead: "lider",
  worker: "colaborador",
};

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [workload, setWorkload] = useState<WorkloadRow[]>([]);
  const [trends, setTrends] = useState<TrendRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [projectProgressById, setProjectProgressById] = useState<Record<string, ProjectProgress>>({});
  const [projectSearch, setProjectSearch] = useState("");
  const [projectStatusFilter, setProjectStatusFilter] = useState<"" | ProjectRow["status"]>("");
  const [projectRiskFilter, setProjectRiskFilter] = useState<"all" | RiskLevel>("all");
  const [taskProjectFilter, setTaskProjectFilter] = useState("");
  const [taskUserFilter, setTaskUserFilter] = useState("");
  const [taskSearchFilter, setTaskSearchFilter] = useState("");
  const [selectedDashboardUserId, setSelectedDashboardUserId] = useState("");
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [taskForm, setTaskForm] = useState({
    projectId: "",
    activityType: "creacion" as TaskRow["activityType"],
    title: "",
    description: "",
    assigneeId: "",
    status: "todo" as TaskRow["status"],
    priority: "medium" as TaskRow["priority"],
    dueDate: "",
    estimatedHours: "",
  });

  const workloadMax = useMemo(() => {
    if (workload.length === 0) {
      return 1;
    }
    return Math.max(...workload.map((item) => Number(item.hoursWorked || 0)), 1);
  }, [workload]);

  const trendsMax = useMemo(() => {
    if (trends.length === 0) {
      return 1;
    }
    return Math.max(...trends.map((item) => Number(item.hoursWorked || 0)), 1);
  }, [trends]);

  const getRiskLevel = (project: ProjectRow, progress?: ProjectProgress): RiskLevel => {
    if (project.status === "cancelled") {
      return "red";
    }
    if (project.status === "on_hold") {
      return "amber";
    }

    const overdue = progress?.overdueTasks ?? 0;
    const completion = progress?.completionRate ?? 0;

    if (overdue >= 3) {
      return "red";
    }
    if (overdue > 0 || (project.status === "active" && completion < 40)) {
      return "amber";
    }
    return "green";
  };

  const projectPortfolioRows = useMemo(() => {
    return projects.map((project) => {
      const progress = projectProgressById[project.id];
      const completionRate = progress?.completionRate ?? 0;
      const overdueTasks = progress?.overdueTasks ?? 0;
      const risk = getRiskLevel(project, progress);

      return {
        ...project,
        completionRate,
        overdueTasks,
        risk,
      };
    });
  }, [projectProgressById, projects]);

  const filteredProjectRows = useMemo(() => {
    return projectPortfolioRows.filter((project) => {
      const bySearch =
        projectSearch.trim().length === 0 ||
        project.code.toLowerCase().includes(projectSearch.toLowerCase()) ||
        project.name.toLowerCase().includes(projectSearch.toLowerCase());
      const byStatus = projectStatusFilter.length === 0 || project.status === projectStatusFilter;
      const byRisk = projectRiskFilter === "all" || project.risk === projectRiskFilter;

      return bySearch && byStatus && byRisk;
    });
  }, [projectPortfolioRows, projectRiskFilter, projectSearch, projectStatusFilter]);

  const projectKpis = useMemo(() => {
    const total = projectPortfolioRows.length;
    const active = projectPortfolioRows.filter((project) => project.status === "active").length;
    const inRisk = projectPortfolioRows.filter((project) => project.risk !== "green").length;
    const overdue = projectPortfolioRows.reduce((sum, project) => sum + project.overdueTasks, 0);
    const averageCompletion =
      total === 0
        ? 0
        : Number(
            (
              projectPortfolioRows.reduce((sum, project) => sum + project.completionRate, 0) / total
            ).toFixed(1),
          );

    return {
      total,
      active,
      inRisk,
      overdue,
      averageCompletion,
    };
  }, [projectPortfolioRows]);

  const taskKpis = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const soonLimit = new Date(today);
    soonLimit.setDate(soonLimit.getDate() + 3);

    const total = tasks.length;
    const todo = tasks.filter((task) => task.status === "todo").length;
    const doing = tasks.filter((task) => task.status === "doing").length;
    const blocked = tasks.filter((task) => task.status === "blocked").length;
    const done = tasks.filter((task) => task.status === "done").length;
    const urgent = tasks.filter((task) => task.priority === "urgent" && task.status !== "done").length;
    const overdue = tasks.filter((task) => {
      if (task.status === "done" || !task.dueDate) {
        return false;
      }
      return new Date(task.dueDate) < today;
    }).length;
    const dueSoon = tasks.filter((task) => {
      if (task.status === "done" || !task.dueDate) {
        return false;
      }
      const due = new Date(task.dueDate);
      return due >= today && due <= soonLimit;
    }).length;
    const myTasks = currentUserId
      ? tasks.filter((task) => task.assigneeId === currentUserId && task.status !== "done").length
      : 0;

    return {
      total,
      todo,
      doing,
      blocked,
      done,
      urgent,
      overdue,
      dueSoon,
      myTasks,
    };
  }, [tasks, currentUserId]);

  const projectsById = useMemo(() => {
    return Object.fromEntries(projects.map((project) => [project.id, project]));
  }, [projects]);

  const usersById = useMemo(() => {
    return Object.fromEntries(users.map((user) => [user.id, user]));
  }, [users]);

  const openTasks = useMemo(() => tasks.filter((task) => task.status !== "done"), [tasks]);

  const taskProjectOptions = useMemo(() => {
    const ids = new Set(openTasks.map((task) => task.projectId));
    return projects.filter((project) => ids.has(project.id));
  }, [projects, openTasks]);

  const taskUserOptions = useMemo(() => {
    const ids = new Set(openTasks.map((task) => task.assigneeId).filter(Boolean) as string[]);
    return users.filter((user) => ids.has(user.id));
  }, [users, openTasks]);

  const filteredTaskRows = useMemo(() => {
    return openTasks.filter((task) => {
      const project = projectsById[task.projectId];
      const byProject = taskProjectFilter.length === 0 || task.projectId === taskProjectFilter;
      const byUser = taskUserFilter.length === 0 || (task.assigneeId ?? "") === taskUserFilter;
      const byTaskSearch =
        taskSearchFilter.trim().length === 0 ||
        task.title.toLowerCase().includes(taskSearchFilter.toLowerCase()) ||
        task.activityType.toLowerCase().includes(taskSearchFilter.toLowerCase()) ||
        (project?.name ?? "").toLowerCase().includes(taskSearchFilter.toLowerCase()) ||
        (project?.code ?? "").toLowerCase().includes(taskSearchFilter.toLowerCase());

      return byProject && byUser && byTaskSearch;
    });
  }, [openTasks, projectsById, taskProjectFilter, taskSearchFilter, taskUserFilter]);

  const selectedDashboardUser = useMemo(
    () => users.find((user) => user.id === selectedDashboardUserId),
    [users, selectedDashboardUserId],
  );

  const selectedDashboardUserTasks = useMemo(() => {
    if (!selectedDashboardUserId) {
      return [];
    }

    return tasks.filter((task) => task.assigneeId === selectedDashboardUserId);
  }, [selectedDashboardUserId, tasks]);

  const selectedDashboardUserSummary = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const total = selectedDashboardUserTasks.length;
    const done = selectedDashboardUserTasks.filter((task) => task.status === "done").length;
    const blocked = selectedDashboardUserTasks.filter((task) => task.status === "blocked").length;
    const active = selectedDashboardUserTasks.filter((task) => task.status !== "done").length;
    const urgent = selectedDashboardUserTasks.filter(
      (task) => task.priority === "urgent" && task.status !== "done",
    ).length;
    const overdue = selectedDashboardUserTasks.filter((task) => {
      if (task.status === "done" || !task.dueDate) {
        return false;
      }

      return new Date(task.dueDate) < today;
    }).length;

    return {
      total,
      done,
      blocked,
      active,
      urgent,
      overdue,
    };
  }, [selectedDashboardUserTasks]);

  const selectedTaskProject = useMemo(
    () => projects.find((project) => project.id === taskForm.projectId),
    [projects, taskForm.projectId],
  );

  const projectTaskSpecialtyLabel = (project?: ProjectRow) => {
    if (!project?.scope) {
      return "";
    }

    return specialtyLabels[project.scope];
  };

  useEffect(() => {
    const savedToken = getStoredToken();
    const savedEmail = getStoredEmail();
    const savedRole = getStoredRole();

    if (!savedToken) {
      router.replace("/");
      return;
    }

    setEmail(savedEmail);
    setRole(savedRole);
    setCurrentUserId(getStoredUserId());

    const loadDashboard = async () => {
      try {
        const headers = authHeaders();
        const [summaryResponse, workloadResponse, trendsResponse, projectsResponse] = await Promise.all([
          axios.get(`${API_URL}/dashboard/summary`, { headers }),
          axios.get(`${API_URL}/dashboard/workload`, { headers }),
          axios.get(`${API_URL}/dashboard/trends`, { headers }),
          axios.get(`${API_URL}/projects`, { headers }),
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
        } else {
          const tasksResponse = await axios.get(`${API_URL}/tasks`, { headers });
          loadedTasks = tasksResponse.data as TaskRow[];
        }

        let loadedUsers: UserOption[] = [];
        try {
          const usersResponse = await axios.get(`${API_URL}/users`, { headers });
          loadedUsers = usersResponse.data as UserOption[];
        } catch {
          loadedUsers = [];
        }

        setSummary(summaryResponse.data as Summary);
        setWorkload(workloadResponse.data as WorkloadRow[]);
        setTrends(trendsResponse.data as TrendRow[]);
        setTasks(loadedTasks);
        setUsers(loadedUsers);
        setSelectedDashboardUserId((current) => {
          if (current && loadedUsers.some((user) => user.id === current)) {
            return current;
          }

          const firstCandidate = loadedUsers.find((user) => user.role !== "manager");
          return firstCandidate?.id ?? loadedUsers[0]?.id ?? "";
        });

        const loadedProjects = projectsResponse.data as ProjectRow[];
        setProjects(loadedProjects);
        setTaskForm((current) => {
          const selectedProjectId =
            current.projectId && loadedProjects.some((project) => project.id === current.projectId)
              ? current.projectId
              : (loadedProjects[0]?.id ?? "");
          const selectedAssigneeId =
            current.assigneeId && loadedUsers.some((user) => user.id === current.assigneeId)
              ? current.assigneeId
              : (loadedUsers[0]?.id ?? "");

          return {
            ...current,
            projectId: selectedProjectId,
            assigneeId: selectedAssigneeId,
          };
        });

        const progressRequests = await Promise.allSettled(
          loadedProjects.map((project) =>
            axios.get(`${API_URL}/projects/${project.id}/progress`, { headers }),
          ),
        );

        const progressMap: Record<string, ProjectProgress> = {};
        progressRequests.forEach((result, index) => {
          if (result.status === "fulfilled") {
            const row = result.value.data as ProjectProgress;
            progressMap[loadedProjects[index].id] = row;
          }
        });
        setProjectProgressById(progressMap);
      } catch {
        setError("No se pudo cargar el panel. Vuelve a iniciar sesión.");
      } finally {
        setLoading(false);
      }
    };

    void loadDashboard();
  }, [router]);

  const onLogout = () => {
    window.localStorage.removeItem("sistema_mvp_token");
    window.localStorage.removeItem("sistema_mvp_email");
    window.localStorage.removeItem("sistema_mvp_role");
    window.localStorage.removeItem("sistema_mvp_specialty");
    router.replace("/");
  };

  const openTaskModal = (projectId?: string) => {
    setError("");
    setInfo("");
    setTaskForm((current) => ({
      ...current,
      projectId: projectId || current.projectId || projects[0]?.id || "",
      assigneeId: current.assigneeId || users[0]?.id || "",
      title: "",
      description: "",
      dueDate: "",
      estimatedHours: "",
    }));
    setIsTaskModalOpen(true);
  };

  const submitTaskFromModal = async () => {
    setError("");
    setInfo("");
    setSavingTask(true);

    try {
      const payload = {
        projectId: taskForm.projectId,
        activityType: taskForm.activityType,
        title: taskForm.title,
        description: taskForm.description,
        assigneeId: taskForm.assigneeId || undefined,
        status: taskForm.status,
        priority: taskForm.priority,
        dueDate: taskForm.dueDate || undefined,
        estimatedHours: taskForm.estimatedHours
          ? Number(taskForm.estimatedHours)
          : undefined,
      };

      const createdResponse = await axios.post(`${API_URL}/tasks`, payload, {
        headers: authHeaders(),
      });

      const createdTask = createdResponse.data as TaskRow;
      setTasks((current) => [createdTask, ...current]);
      setIsTaskModalOpen(false);
      setTaskForm((current) => ({
        ...current,
        title: "",
        description: "",
        dueDate: "",
        estimatedHours: "",
      }));
      setInfo("Tarea creada.");
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        const rawMessage = caughtError.response?.data?.message;
        const backendMessage =
          typeof rawMessage === "string"
            ? rawMessage
            : Array.isArray(rawMessage)
              ? rawMessage.join(". ")
              : "";

        if (backendMessage) {
          setError(`No se pudo crear la tarea: ${backendMessage}`);
        } else {
          setError("No se pudo crear la tarea. Verifica proyecto, actividad, titulo y descripcion.");
        }
      } else {
        setError("No se pudo crear la tarea. Verifica proyecto, actividad, titulo y descripcion.");
      }
    } finally {
      setSavingTask(false);
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
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              Panel ejecutivo
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--ink-muted)] md:text-base">
              {email ? `Sesión activa como ${email}.` : "Sesión activa."} Aquí ves el resumen, la carga por persona y la tendencia semanal.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2 font-mono text-xs">
            API: {API_URL}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-[var(--accent)]/20 bg-[var(--accent)]/8 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold">Sesión iniciada</p>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Estás dentro del panel. Si quieres salir, cierra la sesión.
            </p>
          </div>
          <button
            onClick={onLogout}
            className="ui-btn ui-btn-secondary"
          >
            Cerrar sesión
          </button>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <nav className="rounded-2xl border border-[var(--line)] bg-white/70 p-3">
            <p className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              Dashboard
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                { label: "Resumen", href: "#resumen" },
                { label: "Proyectos", href: "#proyectos" },
                { label: "Tareas", href: "#tareas" },
                ...(role === "manager" ? [{ label: "Usuarios", href: "#usuarios" }] : []),
              ].map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </nav>

          <nav className="rounded-2xl border border-[var(--line)] bg-white/70 p-3">
            <p className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              Visualizacion
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link
                href="/projects"
                className="ui-btn ui-btn-secondary"
              >
                Ver proyectos
              </Link>
              <Link
                href="/tasks"
                className="ui-btn ui-btn-secondary"
              >
                Ver tareas
              </Link>
              {role === "manager" ? (
                <Link
                  href="/users"
                  className="ui-btn ui-btn-secondary"
                >
                  Ver usuarios
                </Link>
              ) : null}
              <Link
                href="/notifications"
                className="ui-btn ui-btn-secondary"
              >
                Ver notificaciones
              </Link>
              <Link
                href="/capture"
                className="ui-btn ui-btn-primary"
              >
                Cargar datos
              </Link>
            </div>
          </nav>
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
        <article id="proyectos" className="kpi-card fade-up p-5 scroll-mt-6" style={{ animationDelay: "220ms" }}>
          <h2 className="text-lg font-semibold">Proyectos</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Cartera operativa con estado, avance, riesgo y accesos directos.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "Total", value: projectKpis.total, tone: "text-[var(--foreground)]" },
              { label: "Activos", value: projectKpis.active, tone: "text-[var(--accent)]" },
              { label: "En riesgo", value: projectKpis.inRisk, tone: "text-amber-700" },
              { label: "Vencidas", value: projectKpis.overdue, tone: "text-[var(--danger)]" },
              {
                label: "Avance prom.",
                value: `${projectKpis.averageCompletion}%`,
                tone: "text-[var(--accent-2)]",
              },
            ].map((card) => (
              <div key={card.label} className="rounded-2xl border border-[var(--line)] bg-white p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">{card.label}</p>
                <p className={`mt-2 text-xl font-semibold ${card.tone}`}>{card.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <input
              name="dashboard-project-search"
              value={projectSearch}
              onChange={(event) => setProjectSearch(event.target.value)}
              className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
              placeholder="Buscar por academia o nombre"
            />

            <select
              name="dashboard-project-status-filter"
              value={projectStatusFilter}
              onChange={(event) => setProjectStatusFilter(event.target.value as "" | ProjectRow["status"])}
              className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
            >
              <option value="">Todos los estados</option>
              <option value="planned">planificado</option>
              <option value="active">activo</option>
              <option value="on_hold">en pausa</option>
              <option value="done">finalizado</option>
              <option value="cancelled">cancelado</option>
            </select>

            <select
              name="dashboard-project-risk-filter"
              value={projectRiskFilter}
              onChange={(event) => setProjectRiskFilter(event.target.value as "all" | RiskLevel)}
              className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
            >
              <option value="all">Todos los riesgos</option>
              <option value="green">estable</option>
              <option value="amber">en seguimiento</option>
              <option value="red">en riesgo</option>
            </select>
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--line)] bg-white">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--background)]/60 text-left">
                  <th className="px-3 py-3 font-semibold">Academia</th>
                  <th className="px-3 py-3 font-semibold">Nombre</th>
                  <th className="px-3 py-3 font-semibold">Especialidad</th>
                  <th className="px-3 py-3 font-semibold">Estado</th>
                  <th className="px-3 py-3 font-semibold">Avance</th>
                  <th className="px-3 py-3 font-semibold">Vencidas</th>
                  <th className="px-3 py-3 font-semibold">Semaforo</th>
                  <th className="px-3 py-3 font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjectRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-4 text-center text-[var(--ink-muted)]">
                      No hay proyectos para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredProjectRows.map((project) => (
                    <tr key={project.id} className="border-b border-[var(--line)]/50 align-top">
                      <td className="px-3 py-3">
                        <p className="font-semibold">{project.name}</p>
                        <p className="mt-1 text-xs text-[var(--ink-muted)]">
                          Fin: {project.endDate ?? "sin fecha"}
                        </p>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">{project.code}</td>
                      <td className="px-3 py-3">{project.scope ? specialtyLabels[project.scope] : "-"}</td>
                      <td className="px-3 py-3">{projectStatusLabels[project.status] ?? project.status}</td>
                      <td className="px-3 py-3">{project.completionRate.toFixed(1)}%</td>
                      <td className="px-3 py-3">{project.overdueTasks}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            project.risk === "green"
                              ? "border border-emerald-300 bg-emerald-50 text-emerald-700"
                              : project.risk === "amber"
                                ? "border border-amber-300 bg-amber-50 text-amber-700"
                                : "border border-red-300 bg-red-50 text-red-700"
                          }`}
                        >
                          {riskLabelMap[project.risk]}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href="/projects"
                            className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs font-semibold"
                          >
                            Ver
                          </Link>
                          <Link
                            href="/tasks"
                            className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs font-semibold"
                          >
                            Tareas
                          </Link>
                          {role === "manager" || role === "lead" ? (
                            <button
                              onClick={() => openTaskModal(project.id)}
                              className="rounded-lg border border-[var(--accent)] bg-[var(--accent)]/10 px-2 py-1 text-xs font-semibold text-[var(--accent)]"
                            >
                              Crear tarea
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-2xl border border-dashed border-[var(--line)] bg-[var(--background)] p-4 text-sm text-[var(--ink-muted)]">
            {projectKpis.inRisk > 0
              ? `Atencion: hay ${projectKpis.inRisk} proyecto(s) en seguimiento o en riesgo.`
              : "Todos los proyectos de la cartera estan estables hoy."}
          </div>
        </article>

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
                      <td className="px-3 py-3">{taskStatusLabels[task.status] ?? task.status}</td>
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
              href="/tasks?status=blocked"
              className="rounded-full border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
            >
              Ver bloqueadas
            </Link>
            <Link
              href="/tasks?due=soon"
              className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700"
            >
              Vencen pronto
            </Link>
            <Link
              href="/tasks?due=overdue"
              className="rounded-full border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 py-2 text-xs font-semibold text-[var(--danger)]"
            >
              Vencidas
            </Link>
            <Link
              href="/tasks?scope=my"
              className="rounded-full border border-[var(--line)] bg-white px-3 py-2 text-xs font-semibold"
            >
              Mis tareas
            </Link>
            <Link
              href="/tasks?priority=urgent"
              className="rounded-full border border-[var(--line)] bg-white px-3 py-2 text-xs font-semibold"
            >
              Prioridad urgente
            </Link>
          </div>

          <div className="mt-4 rounded-2xl border border-dashed border-[var(--line)] bg-[var(--background)] p-4 text-sm text-[var(--ink-muted)]">
            {role === "worker"
              ? `Tienes ${taskKpis.myTasks} tarea(s) pendiente(s) asignadas a tu usuario.`
              : `Hay ${taskKpis.urgent} tarea(s) urgentes activas y ${taskKpis.todo} en por hacer.`}
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                Carga por colaborador
              </p>
              {workload.length === 0 ? (
                <p className="text-sm text-[var(--ink-muted)]">Sin datos aún.</p>
              ) : (
                workload.map((row) => {
                  const hours = Number(row.hoursWorked || 0);
                  const pct = Math.min((hours / workloadMax) * 100, 100);
                  return (
                    <div key={row.userId} className="mb-3">
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <p className="font-mono text-xs">{row.userId.slice(0, 8)}</p>
                        <p className="text-sm text-[var(--ink-muted)]">
                          {hours.toFixed(2)} h ({row.updatesCount} actualizaciones)
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

            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                Tendencia semanal
              </p>
              {trends.length === 0 ? (
                <p className="text-sm text-[var(--ink-muted)]">Sin datos aún.</p>
              ) : (
                trends.map((row) => {
                  const hours = Number(row.hoursWorked || 0);
                  const pct = Math.min((hours / trendsMax) * 100, 100);
                  const date = new Date(row.weekStart);
                  return (
                    <div key={row.weekStart} className="mb-3">
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <p className="font-mono text-xs">
                          {date.toLocaleDateString("es-ES", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
                        </p>
                        <p className="text-sm text-[var(--ink-muted)]">
                          {hours.toFixed(2)} h ({row.updatesCount} actualizaciones)
                        </p>
                      </div>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{
                            width: `${pct}%`,
                            background:
                              "linear-gradient(90deg, var(--accent-2), #f0b85a)",
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </article>
      </section>

      {role === "manager" ? (
      <section id="usuarios" className="kpi-card fade-up p-5 scroll-mt-6" style={{ animationDelay: "380ms" }}>
        <h2 className="text-lg font-semibold">Usuarios</h2>
        {role === "manager" ? (
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

            <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--line)] bg-white">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] bg-[var(--background)]/60 text-left">
                    <th className="px-3 py-3 font-semibold">Proyecto</th>
                    <th className="px-3 py-3 font-semibold">Tarea</th>
                    <th className="px-3 py-3 font-semibold">Estado</th>
                    <th className="px-3 py-3 font-semibold">Prioridad</th>
                    <th className="px-3 py-3 font-semibold">Vence</th>
                  </tr>
                </thead>
                <tbody>
                  {!selectedDashboardUser || selectedDashboardUserTasks.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-[var(--ink-muted)]">
                        Este usuario no tiene tareas asignadas.
                      </td>
                    </tr>
                  ) : (
                    selectedDashboardUserTasks.map((task) => (
                      <tr key={task.id} className="border-b border-[var(--line)]/50 align-top">
                        <td className="px-3 py-3">
                          <p className="font-semibold">{projectsById[task.projectId]?.name ?? "-"}</p>
                          <p className="mt-1 font-mono text-xs text-[var(--ink-muted)]">
                            {projectsById[task.projectId]?.code ?? "-"}
                          </p>
                        </td>
                        <td className="px-3 py-3">{task.title}</td>
                        <td className="px-3 py-3">{taskStatusLabels[task.status] ?? task.status}</td>
                        <td className="px-3 py-3">{taskPriorityLabels[task.priority] ?? task.priority}</td>
                        <td className="px-3 py-3">{task.dueDate ?? "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Este apartado de estadisticas por usuario es exclusivo de gerencia.
          </p>
        )}
      </section>
      ) : null}

      {isTaskModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4"
          onClick={() => setIsTaskModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-[var(--line)] bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                  Captura
                </p>
                <h3 className="mt-1 text-lg font-semibold">Crear tarea</h3>
              </div>
              <button
                onClick={() => setIsTaskModalOpen(false)}
                className="ui-btn ui-btn-secondary ui-btn-sm"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <select
                name="task-modal-project"
                className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
                value={taskForm.projectId}
                onChange={(event) => setTaskForm({ ...taskForm, projectId: event.target.value })}
              >
                <option value="">Nombre del proyecto</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>

              <div className="grid gap-3 md:grid-cols-2">
                <input
                  name="task-modal-academia"
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-sm"
                  placeholder="Academia"
                  value={selectedTaskProject?.code ?? ""}
                  readOnly
                />
                <input
                  name="task-modal-especialidad"
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-sm"
                  placeholder="Especialidad"
                  value={projectTaskSpecialtyLabel(selectedTaskProject)}
                  readOnly
                />
              </div>

              <select
                name="task-modal-activity"
                className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
                value={taskForm.activityType}
                onChange={(event) =>
                  setTaskForm({ ...taskForm, activityType: event.target.value as TaskRow["activityType"] })
                }
              >
                {activityTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <input
                name="task-modal-title"
                className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
                placeholder="Titulo"
                value={taskForm.title}
                onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })}
              />

              <textarea
                name="task-modal-description"
                className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
                placeholder="Descripcion"
                value={taskForm.description}
                onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })}
                rows={4}
              />

              <select
                name="task-modal-assignee"
                className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
                value={taskForm.assigneeId}
                onChange={(event) => setTaskForm({ ...taskForm, assigneeId: event.target.value })}
              >
                <option value="">Asignado a</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName} - {roleLabels[user.role] ?? user.role}
                  </option>
                ))}
              </select>

              <div className="grid gap-3 md:grid-cols-2">
                <select
                  name="task-modal-status"
                  className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
                  value={taskForm.status}
                  onChange={(event) =>
                    setTaskForm({ ...taskForm, status: event.target.value as TaskRow["status"] })
                  }
                >
                  {taskStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <select
                  name="task-modal-priority"
                  className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
                  value={taskForm.priority}
                  onChange={(event) =>
                    setTaskForm({ ...taskForm, priority: event.target.value as TaskRow["priority"] })
                  }
                >
                  {priorityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <input
                  name="task-modal-due-date"
                  type="date"
                  className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
                  value={taskForm.dueDate}
                  onChange={(event) => setTaskForm({ ...taskForm, dueDate: event.target.value })}
                />
                <input
                  name="task-modal-estimated-hours"
                  type="number"
                  min="0"
                  step="0.5"
                  className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
                  placeholder="Horas estimadas"
                  value={taskForm.estimatedHours}
                  onChange={(event) => setTaskForm({ ...taskForm, estimatedHours: event.target.value })}
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setIsTaskModalOpen(false)}
                className="ui-btn ui-btn-secondary"
              >
                Cancelar
              </button>
              <button
                onClick={() => void submitTaskFromModal()}
                disabled={savingTask}
                className="ui-btn ui-btn-primary disabled:cursor-not-allowed disabled:opacity-70"
              >
                {savingTask ? "Creando..." : "Crear tarea"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}