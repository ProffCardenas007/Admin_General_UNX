"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL, authHeaders, getStoredRole, getStoredToken, getStoredUserId } from "../../lib/api";
import { specialtyLabels, type LeadSpecialty } from "../../lib/specialties";

type ProjectRow = {
  id: string;
  code: string;
  name: string;
  ownerTeamId?: string;
  createdBy?: string | null;
  scope?: LeadSpecialty | null;
  status: "planned" | "active" | "on_hold" | "done" | "cancelled";
  startDate?: string;
  endDate?: string;
  createdAt: string;
};

type TaskRow = {
  id: string;
  code: string;
  projectId: string;
  activityType: "revision" | "edicion" | "creacion" | "presentaciones" | "grabacion" | "plataforma" | "administrativo";
  title: string;
  assigneeId?: string;
  status: "todo" | "doing" | "blocked" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  dueDate?: string;
};

type UserRow = {
  id: string;
  fullName: string;
  role: "manager" | "lead" | "worker";
};

type ProjectDraft = {
  name: string;
  status: ProjectRow["status"];
  startDate: string;
  endDate: string;
};

const statusLabels: Record<ProjectRow["status"], string> = {
  planned: "planificado",
  active: "activo",
  on_hold: "en pausa",
  done: "finalizado",
  cancelled: "cancelado",
};

const taskStatusLabels: Record<TaskRow["status"], string> = {
  todo: "por hacer",
  doing: "en curso",
  blocked: "bloqueada",
  done: "finalizada",
};

const taskPriorityLabels: Record<TaskRow["priority"], string> = {
  low: "baja",
  medium: "media",
  high: "alta",
  urgent: "urgente",
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

const getProjectHealth = (project: ProjectRow) => {
  if (!project.endDate) {
    return {
      label: "Sin fecha fin",
      dotClass: "bg-slate-400",
      textClass: "text-slate-600",
    };
  }

  const today = new Date();
  const dueDate = new Date(`${project.endDate}T23:59:59`);
  const dayMs = 1000 * 60 * 60 * 24;
  const daysLeft = Math.ceil((dueDate.getTime() - today.getTime()) / dayMs);

  if (daysLeft < 0) {
    return {
      label: `Atrasado (${Math.abs(daysLeft)}d)`,
      dotClass: "bg-red-500",
      textClass: "text-red-600",
    };
  }

  if (daysLeft <= 3) {
    return {
      label: `Critico (${daysLeft}d)`,
      dotClass: "bg-red-500",
      textClass: "text-red-600",
    };
  }

  if (daysLeft <= 7) {
    return {
      label: `Atencion (${daysLeft}d)`,
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

export default function ProjectsPage() {
  const router = useRouter();
  const [role, setRole] = useState("");
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [savingProjectId, setSavingProjectId] = useState("");
  const [deletingProjectId, setDeletingProjectId] = useState("");
  const [movingTaskId, setMovingTaskId] = useState("");
  const [openedProjectId, setOpenedProjectId] = useState("");
  const [taskDestinationById, setTaskDestinationById] = useState<Record<string, string>>({});
  const [projectDrafts, setProjectDrafts] = useState<Record<string, ProjectDraft>>({});
  const canEditProjects = role === "manager" || role === "lead";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.replace("/");
      return;
    }

    const savedRole = getStoredRole();
    if (savedRole === "worker") {
      router.replace("/tasks");
      return;
    }

    setRole(savedRole);
    setCurrentUserId(getStoredUserId());

    const loadProjects = async () => {
      try {
        const headers = authHeaders();
        const [projectsResponse, usersResponse] = await Promise.all([
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
        } else {
          const tasksResponse = await axios.get(`${API_URL}/tasks`, { headers });
          loadedTasks = tasksResponse.data as TaskRow[];
        }

        setProjects(projectsResponse.data as ProjectRow[]);
        setTasks(loadedTasks);
        setUsers(usersResponse.data as UserRow[]);
        setProjectDrafts(
          Object.fromEntries(
            (projectsResponse.data as ProjectRow[]).map((project) => [
              project.id,
              {
                name: project.name,
                status: project.status,
                startDate: project.startDate ?? "",
                endDate: project.endDate ?? "",
              },
            ]),
          ),
        );
      } catch {
        setError("No se pudo cargar el listado de proyectos.");
      } finally {
        setLoading(false);
      }
    };

    void loadProjects();
  }, [router]);

  const onDeleteProject = async (projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    if (!project) {
      return;
    }

    const canDeleteProject = role === "manager" || (role === "lead" && project.createdBy === currentUserId);
    if (!canDeleteProject) {
      return;
    }

    const confirmed = window.confirm(`Vas a borrar el proyecto ${project.code}. Esta accion no se puede deshacer. Continuar?`);
    if (!confirmed) {
      return;
    }

    setError("");
    setInfo("");
    setDeletingProjectId(projectId);

    try {
      await axios.delete(`${API_URL}/projects/${projectId}`, {
        headers: authHeaders(),
      });

      setProjects((current) => current.filter((item) => item.id !== projectId));
      setInfo(`Proyecto ${project.code} eliminado.`);
    } catch {
      setError("No se pudo borrar el proyecto. Solo gerencia o el lider creador puede hacerlo.");
    } finally {
      setDeletingProjectId("");
    }
  };

  const onSaveProject = async (projectId: string) => {
    if (!canEditProjects) {
      return;
    }

    const project = projects.find((item) => item.id === projectId);
    const draft = projectDrafts[projectId];

    if (!project || !draft) {
      return;
    }

    setError("");
    setInfo("");
    setSavingProjectId(projectId);

    try {
      const response = await axios.patch(
        `${API_URL}/projects/${projectId}`,
        {
          name: draft.name,
          status: draft.status,
          startDate: draft.startDate || undefined,
          endDate: draft.endDate || undefined,
        },
        { headers: authHeaders() },
      );

      const updated = response.data as ProjectRow;
      setProjects((current) => current.map((item) => (item.id === projectId ? updated : item)));
      setProjectDrafts((current) => ({
        ...current,
        [projectId]: {
          name: updated.name,
          status: updated.status,
          startDate: updated.startDate ?? "",
          endDate: updated.endDate ?? "",
        },
      }));
      setInfo(`Proyecto ${updated.code} actualizado.`);
    } catch {
      setError("No se pudo actualizar el proyecto. Revisa permisos o datos capturados.");
    } finally {
      setSavingProjectId("");
    }
  };

  const onMoveTask = async (task: TaskRow) => {
    if (role !== "manager") {
      return;
    }

    const destinationProjectId = taskDestinationById[task.id] ?? "";
    const destinationProject = projects.find((project) => project.id === destinationProjectId);
    if (!destinationProject || destinationProject.id === task.projectId) {
      return;
    }

    setError("");
    setInfo("");
    setMovingTaskId(task.id);

    try {
      const response = await axios.patch(
        `${API_URL}/tasks/${task.id}`,
        { projectId: destinationProject.id },
        { headers: authHeaders() },
      );
      const updatedTask = response.data as TaskRow;
      setTasks((current) => current.map((item) => (item.id === task.id ? updatedTask : item)));
      setTaskDestinationById((current) => {
        const next = { ...current };
        delete next[task.id];
        return next;
      });
      setInfo(`Tarea ${task.code} movida a ${destinationProject.code} · ${destinationProject.name}.`);
    } catch {
      setError("No se pudo mover la tarea. Esta accion es exclusiva de gerencia.");
    } finally {
      setMovingTaskId("");
    }
  };

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const bySearch =
        search.trim().length === 0 ||
        project.code.toLowerCase().includes(search.toLowerCase()) ||
        project.name.toLowerCase().includes(search.toLowerCase());

      const byStatus = statusFilter.length === 0
        ? project.status !== "done"
        : project.status === statusFilter;

      return bySearch && byStatus;
    });
  }, [projects, search, statusFilter]);

  const tasksByProject = useMemo(() => {
    return tasks.reduce<Record<string, TaskRow[]>>((accumulator, task) => {
      if (!accumulator[task.projectId]) {
        accumulator[task.projectId] = [];
      }
      accumulator[task.projectId].push(task);
      return accumulator;
    }, {});
  }, [tasks]);

  const assigneeLabel = (assigneeId?: string) => {
    if (!assigneeId) {
      return "Sin asignar";
    }

    const user = users.find((item) => item.id === assigneeId);
    return user
      ? `${user.fullName} (${roleLabels[user.role] ?? user.role})`
      : assigneeId.slice(0, 8);
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <section className="glass-panel fade-up p-6 md:p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">
              Sistema de proyectos
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Proyectos</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-[var(--ink-muted)] md:text-base">
              Cartera operativa con estado, avance y semáforo de salud.
            </p>
          </div>
          {canEditProjects ? (
            <Link
              href="/capture?mode=project"
              className="ui-btn ui-btn-primary"
            >
              Crear proyecto
            </Link>
          ) : null}
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="ui-control"
            placeholder="Buscar por academia o nombre"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="ui-control"
          >
            <option value="">Todos excepto finalizados</option>
            <option value="planned">planificado</option>
            <option value="active">activo</option>
            <option value="on_hold">en pausa</option>
            <option value="done">finalizado</option>
            <option value="cancelled">cancelado</option>
          </select>
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

      <section className="kpi-card fade-up overflow-hidden p-0">
        {loading ? (
          <div className="p-5">
            <div className="ui-skeleton h-6 w-48" />
          </div>
        ) : filteredProjects.length === 0 ? (
          <p className="ui-empty m-4 px-4 py-3 text-sm">No hay proyectos para esos filtros.</p>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <table className="ui-table min-w-full w-full">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--background)]/70 text-left">
                  <th className="px-4 py-3 font-semibold">Tareas</th>
                  <th className="px-4 py-3 font-semibold">Academia</th>
                  <th className="px-4 py-3 font-semibold">Nombre</th>
                  <th className="px-4 py-3 font-semibold">Especialidad</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Inicio</th>
                  <th className="px-4 py-3 font-semibold">Fin</th>
                  <th className="px-4 py-3 font-semibold">Semaforo</th>
                  {canEditProjects ? <th className="px-4 py-3 font-semibold">Accion</th> : null}
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((project) => {
                  const health = getProjectHealth(project);
                  const projectTasks = (tasksByProject[project.id] ?? []).filter((task) => task.status !== "done");
                  const isOpen = openedProjectId === project.id;
                  const canDeleteProject = role === "manager" || (role === "lead" && project.createdBy === currentUserId);
                  const colSpan = canEditProjects ? 9 : 8;
                  const draft = projectDrafts[project.id];

                  return (
                    <Fragment key={project.id}>
                      <tr className="border-b border-[var(--line)]/60 align-top">
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setOpenedProjectId(isOpen ? "" : project.id)}
                            className="ui-btn ui-btn-secondary ui-btn-sm"
                          >
                            {isOpen ? "Ocultar" : "Ver"} ({projectTasks.length})
                          </button>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{project.code}</td>
                        <td className="px-4 py-3 font-semibold break-words">
                          {canEditProjects ? (
                            <input
                              value={draft?.name ?? project.name}
                              onChange={(event) =>
                                setProjectDrafts((current) => ({
                                  ...current,
                                  [project.id]: {
                                    ...(current[project.id] ?? {
                                      name: project.name,
                                      status: project.status,
                                      startDate: project.startDate ?? "",
                                      endDate: project.endDate ?? "",
                                    }),
                                    name: event.target.value,
                                  },
                                }))
                              }
                              className="w-full max-w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs md:min-w-[200px]"
                            />
                          ) : (
                            project.name
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-normal break-words">{project.scope ? specialtyLabels[project.scope] : "-"}</td>
                        <td className="px-4 py-3">
                          {canEditProjects ? (
                            <select
                              value={draft?.status ?? project.status}
                              onChange={(event) =>
                                setProjectDrafts((current) => ({
                                  ...current,
                                  [project.id]: {
                                    ...(current[project.id] ?? {
                                      name: project.name,
                                      status: project.status,
                                      startDate: project.startDate ?? "",
                                      endDate: project.endDate ?? "",
                                    }),
                                    status: event.target.value as ProjectRow["status"],
                                  },
                                }))
                              }
                              className="w-full max-w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs md:min-w-[160px]"
                            >
                              <option value="planned">planificado</option>
                              <option value="active">activo</option>
                              <option value="on_hold">en pausa</option>
                              <option value="done">finalizado</option>
                              <option value="cancelled">cancelado</option>
                            </select>
                          ) : (
                            statusLabels[project.status] ?? project.status
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {canEditProjects ? (
                            <input
                              type="date"
                              value={draft?.startDate ?? project.startDate ?? ""}
                              onChange={(event) =>
                                setProjectDrafts((current) => ({
                                  ...current,
                                  [project.id]: {
                                    ...(current[project.id] ?? {
                                      name: project.name,
                                      status: project.status,
                                      startDate: project.startDate ?? "",
                                      endDate: project.endDate ?? "",
                                    }),
                                    startDate: event.target.value,
                                  },
                                }))
                              }
                              className="w-full max-w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs md:min-w-[140px]"
                            />
                          ) : (
                            project.startDate ?? "-"
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {canEditProjects ? (
                            <input
                              type="date"
                              value={draft?.endDate ?? project.endDate ?? ""}
                              onChange={(event) =>
                                setProjectDrafts((current) => ({
                                  ...current,
                                  [project.id]: {
                                    ...(current[project.id] ?? {
                                      name: project.name,
                                      status: project.status,
                                      startDate: project.startDate ?? "",
                                      endDate: project.endDate ?? "",
                                    }),
                                    endDate: event.target.value,
                                  },
                                }))
                              }
                              className="w-full max-w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs md:min-w-[140px]"
                            />
                          ) : (
                            project.endDate ?? "-"
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-2 text-xs font-semibold ${health.textClass}`}>
                            <span className={`h-2.5 w-2.5 rounded-full ${health.dotClass}`} />
                            {health.label}
                          </span>
                        </td>
                        {canEditProjects ? (
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-2">
                              <button
                                onClick={() => void onSaveProject(project.id)}
                                disabled={savingProjectId === project.id}
                                className="ui-btn ui-btn-primary ui-btn-sm disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                {savingProjectId === project.id ? "Guardando..." : "Guardar"}
                              </button>
                              {canDeleteProject ? (
                                <button
                                  onClick={() => void onDeleteProject(project.id)}
                                  disabled={deletingProjectId === project.id}
                                  className="ui-btn ui-btn-danger ui-btn-sm disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                  {deletingProjectId === project.id ? "Borrando..." : "Borrar"}
                                </button>
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                      {isOpen ? (
                        <tr className="border-b border-[var(--line)]/60">
                          <td colSpan={colSpan} className="bg-[var(--background)]/35 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                              Tareas del proyecto
                            </p>
                            {projectTasks.length > 0 ? (
                              <div className="mt-3 space-y-2">
                                {projectTasks.map((task) => (
                                  <div key={task.id} className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs">
                                    <p className="font-semibold text-[var(--foreground)]">
                                      {task.title}
                                    </p>
                                    <p className="mt-1 text-[var(--ink-muted)]">
                                      Responsable: {assigneeLabel(task.assigneeId)} | Actividad: {activityTypeLabels[task.activityType] ?? task.activityType}
                                    </p>
                                    <p className="mt-1 text-[var(--ink-muted)]">
                                      {taskStatusLabels[task.status] ?? task.status} | prioridad {taskPriorityLabels[task.priority] ?? task.priority} | fecha fin {task.dueDate ?? "-"}
                                    </p>
                                    {role === "manager" ? (
                                      <div className="mt-3 flex max-w-3xl flex-col gap-2 border-t border-[var(--line)] pt-3 sm:flex-row sm:items-center">
                                        <select
                                          aria-label={`Proyecto destino para ${task.title}`}
                                          value={taskDestinationById[task.id] ?? ""}
                                          onChange={(event) =>
                                            setTaskDestinationById((current) => ({
                                              ...current,
                                              [task.id]: event.target.value,
                                            }))
                                          }
                                          className="ui-control min-w-0 flex-1 text-xs"
                                        >
                                          <option value="">Seleccionar proyecto destino</option>
                                          {projects
                                            .filter(
                                              (destination) =>
                                                destination.id !== task.projectId &&
                                                destination.status !== "done",
                                            )
                                            .map((destination) => (
                                              <option key={destination.id} value={destination.id}>
                                                {destination.code} · {destination.name} · {destination.scope ? specialtyLabels[destination.scope] : "Sin especialidad"}
                                              </option>
                                            ))}
                                        </select>
                                        <button
                                          type="button"
                                          onClick={() => void onMoveTask(task)}
                                          disabled={!taskDestinationById[task.id] || movingTaskId === task.id}
                                          className="ui-btn ui-btn-primary ui-btn-sm shrink-0 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                          {movingTaskId === task.id ? "Moviendo..." : "Mover tarea"}
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-2 text-sm text-[var(--ink-muted)]">
                                Este proyecto no tiene tareas pendientes por monitorear.
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
    </div>
  );
}
