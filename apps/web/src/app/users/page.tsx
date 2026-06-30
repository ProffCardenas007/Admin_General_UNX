"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL, authHeaders, getStoredRole, getStoredToken } from "../../lib/api";
import { LEAD_SPECIALTIES, specialtyLabels, type LeadSpecialty } from "../../lib/specialties";

type UserRow = {
  id: string;
  fullName: string;
  email: string;
  role: "manager" | "lead" | "worker";
  specialty?: LeadSpecialty | null;
  specialties?: LeadSpecialty[] | null;
  teamIds?: string[];
  isActive: boolean;
  createdAt: string;
};

type TeamRow = {
  id: string;
  name: string;
  memberCount?: number;
};

type UserDraft = {
  fullName: string;
  email: string;
  role: UserRow["role"];
  specialties: LeadSpecialty[];
  teamIds: string[];
  isActive: boolean;
  password: string;
};

type TaskStatsRow = {
  id: string;
  projectId: string;
  activityType: "revision" | "edicion" | "creacion" | "presentaciones" | "grabacion" | "plataforma";
  title: string;
  assigneeId?: string;
  status: "todo" | "doing" | "blocked" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  dueDate?: string;
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

const roleLabels: Record<UserRow["role"], string> = {
  manager: "gerencia",
  lead: "lider",
  worker: "colaborador",
};

const activityTypeLabels: Record<TaskStatsRow["activityType"], string> = {
  revision: "revision",
  edicion: "edicion",
  creacion: "creacion",
  presentaciones: "presentaciones",
  grabacion: "grabacion",
  plataforma: "plataforma",
};

const taskStatusLabels: Record<TaskStatsRow["status"], string> = {
  todo: "por hacer",
  doing: "en curso",
  blocked: "bloqueada",
  done: "finalizada",
};

export default function UsersPage() {
  const router = useRouter();
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [savingUserId, setSavingUserId] = useState("");
  const [deletingUserId, setDeletingUserId] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [tasksForStats, setTasksForStats] = useState<TaskStatsRow[]>([]);
  const [selectedStatsUserId, setSelectedStatsUserId] = useState("");
  const [statsPeriod, setStatsPeriod] = useState<"all" | "7d" | "30d" | "custom">("30d");
  const [statsFrom, setStatsFrom] = useState("");
  const [statsTo, setStatsTo] = useState("");
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [selectedUserUpdates, setSelectedUserUpdates] = useState<TaskUpdateRow[]>([]);
  const [newTeamName, setNewTeamName] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [deletingTeamId, setDeletingTeamId] = useState("");
  const [userDrafts, setUserDrafts] = useState<Record<string, UserDraft>>({});

  const toDraftSpecialties = (user: UserRow) => {
    const normalized = Array.isArray(user.specialties)
      ? user.specialties.filter((specialty): specialty is LeadSpecialty =>
          (LEAD_SPECIALTIES as readonly string[]).includes(specialty),
        )
      : [];

    if (normalized.length > 0) {
      return normalized;
    }

    return user.specialty ? [user.specialty] : [];
  };

  const buildUserDraft = (user: UserRow): UserDraft => ({
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    specialties: toDraftSpecialties(user),
    teamIds: user.teamIds ?? [],
    isActive: user.isActive,
    password: "",
  });

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const isManager = role === "manager";

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.replace("/");
      return;
    }

    const savedRole = getStoredRole();
    if (savedRole !== "manager") {
      router.replace("/dashboard");
      return;
    }

    setRole(savedRole);

    const loadUsers = async () => {
      try {
        const headers = authHeaders();
        const [usersResponse, taskResponse, teamsResponse] = await Promise.all([
          axios.get(`${API_URL}/users`, { headers }),
          axios.get(`${API_URL}/tasks`, { headers }),
          axios.get(`${API_URL}/teams`, { headers }),
        ]);

        const loadedTasks = taskResponse.data as TaskStatsRow[];
        const loadedUsers = usersResponse.data as UserRow[];
        const loadedTeams = teamsResponse.data as TeamRow[];
        setTasksForStats(loadedTasks);
        setUsers(loadedUsers);
        setTeams(loadedTeams);
        setSelectedStatsUserId((current) => {
          if (current && loadedUsers.some((user) => user.id === current)) {
            return current;
          }

          const firstCandidate = loadedUsers.find((user) => user.role !== "manager");
          return firstCandidate?.id ?? loadedUsers[0]?.id ?? "";
        });
        setUserDrafts(
          Object.fromEntries(
            loadedUsers.map((user) => [
              user.id,
              buildUserDraft(user),
            ]),
          ),
        );
      } catch {
        setError("No se pudo cargar el listado de usuarios. Revisa tus permisos.");
      } finally {
        setLoading(false);
      }
    };

    void loadUsers();
  }, [router]);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const bySearch =
        search.trim().length === 0 ||
        user.fullName.toLowerCase().includes(search.toLowerCase()) ||
        user.email.toLowerCase().includes(search.toLowerCase());

      const byRole = roleFilter.length === 0 || user.role === roleFilter;
      const byStatus =
        statusFilter.length === 0 ||
        (statusFilter === "active" ? user.isActive : !user.isActive);

      return bySearch && byRole && byStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const selectedStatsUser = useMemo(
    () => users.find((user) => user.id === selectedStatsUserId),
    [users, selectedStatsUserId],
  );

  const selectedUserTasks = useMemo(() => {
    if (!selectedStatsUserId) {
      return [];
    }

    return tasksForStats.filter((task) => task.assigneeId === selectedStatsUserId);
  }, [selectedStatsUserId, tasksForStats]);

  const periodRange = useMemo(() => {
    if (statsPeriod === "all") {
      return { from: "", to: "" };
    }

    if (statsPeriod === "custom") {
      return { from: statsFrom, to: statsTo };
    }

    const today = new Date();
    const days = statsPeriod === "7d" ? 7 : 30;
    const fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() - days);

    return {
      from: fromDate.toISOString().slice(0, 10),
      to: today.toISOString().slice(0, 10),
    };
  }, [statsFrom, statsPeriod, statsTo]);

  const selectedUserTasksByPeriod = useMemo(() => {
    if (statsPeriod === "all") {
      return selectedUserTasks;
    }

    const from = periodRange.from ? new Date(`${periodRange.from}T00:00:00`) : undefined;
    const to = periodRange.to ? new Date(`${periodRange.to}T23:59:59`) : undefined;

    return selectedUserTasks.filter((task) => {
      if (!task.dueDate) {
        return false;
      }

      const due = new Date(`${task.dueDate}T12:00:00`);
      if (from && due < from) {
        return false;
      }
      if (to && due > to) {
        return false;
      }

      return true;
    });
  }, [periodRange.from, periodRange.to, selectedUserTasks, statsPeriod]);

  const selectedUserTaskSummary = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const total = selectedUserTasksByPeriod.length;
    const done = selectedUserTasksByPeriod.filter((task) => task.status === "done").length;
    const blocked = selectedUserTasksByPeriod.filter((task) => task.status === "blocked").length;
    const active = selectedUserTasksByPeriod.filter((task) => task.status !== "done").length;
    const urgent = selectedUserTasksByPeriod.filter(
      (task) => task.priority === "urgent" && task.status !== "done",
    ).length;
    const overdue = selectedUserTasksByPeriod.filter((task) => {
      if (task.status === "done" || !task.dueDate) {
        return false;
      }

      return new Date(task.dueDate) < today;
    }).length;

    const byActivity = selectedUserTasksByPeriod.reduce<Record<TaskStatsRow["activityType"], number>>(
      (accumulator, task) => {
        accumulator[task.activityType] += 1;
        return accumulator;
      },
      {
        revision: 0,
        edicion: 0,
        creacion: 0,
        presentaciones: 0,
        grabacion: 0,
        plataforma: 0,
      },
    );

    return {
      total,
      done,
      blocked,
      active,
      urgent,
      overdue,
      byActivity,
    };
  }, [selectedUserTasksByPeriod]);

  const taskTitleById = useMemo(() => {
    return Object.fromEntries(selectedUserTasks.map((task) => [task.id, task.title]));
  }, [selectedUserTasks]);

  const openDetailsModal = async () => {
    if (!selectedStatsUserId || selectedUserTasks.length === 0) {
      setSelectedUserUpdates([]);
      setIsDetailsModalOpen(true);
      return;
    }

    setLoadingDetails(true);
    setError("");
    try {
      const headers = authHeaders();
      const from = periodRange.from || undefined;
      const to = periodRange.to || undefined;

      const updateRequests = await Promise.allSettled(
        selectedUserTasks.map((task) =>
          axios.get(`${API_URL}/task-updates`, {
            headers,
            params: {
              taskId: task.id,
              from,
              to,
            },
          }),
        ),
      );

      const merged: TaskUpdateRow[] = [];
      updateRequests.forEach((result) => {
        if (result.status === "fulfilled") {
          merged.push(...((result.value.data as TaskUpdateRow[]).filter((update) => update.userId === selectedStatsUserId)));
        }
      });

      merged.sort((a, b) => {
        if (a.updateDate === b.updateDate) {
          return 0;
        }
        return a.updateDate < b.updateDate ? 1 : -1;
      });

      setSelectedUserUpdates(merged);
      setIsDetailsModalOpen(true);
    } catch {
      setError("No se pudo cargar el detalle de actualizaciones del usuario.");
    } finally {
      setLoadingDetails(false);
    }
  };

  const onSaveUser = async (userId: string) => {
    const draft = userDrafts[userId];
    const user = users.find((item) => item.id === userId);

    if (!draft || !user) {
      return;
    }

    if (draft.role === "lead" && draft.specialties.length === 0) {
      setError("Para asignar rol de lider debes seleccionar al menos una especialidad.");
      setInfo("");
      return;
    }

    const sensitiveChanges: string[] = [];
    if (draft.email !== user.email) {
      sensitiveChanges.push("cambio de correo");
    }
    if (draft.role !== user.role) {
      sensitiveChanges.push("cambio de rol");
    }
    if (user.isActive && !draft.isActive) {
      sensitiveChanges.push("desactivacion de usuario");
    }
    if (draft.password.trim().length > 0) {
      sensitiveChanges.push("reseteo de contrasena");
    }

    if (sensitiveChanges.length > 0) {
      const confirmed = window.confirm(
        `Estas por aplicar cambios sensibles (${sensitiveChanges.join(", ")}) a ${user.email}. Deseas continuar?`,
      );
      if (!confirmed) {
        return;
      }
    }

    setError("");
    setInfo("");
    setSavingUserId(userId);

    const payload = {
      email: draft.email,
      fullName: draft.fullName,
      role: draft.role,
      specialties: draft.role === "lead" ? draft.specialties : null,
      teamIds: draft.teamIds,
      isActive: draft.isActive,
      password: draft.password.trim().length > 0 ? draft.password : undefined,
    };

    try {
      const response = await axios.patch(`${API_URL}/users/${userId}`, payload, { headers: authHeaders() });

      const updated = response.data as UserRow;
      setUsers((current) =>
        current.map((item) => (item.id === userId ? { ...item, ...updated } : item)),
      );
      setUserDrafts((current) => ({
        ...current,
        [userId]: {
          ...(current[userId] ?? buildUserDraft(updated)),
          teamIds: updated.teamIds ?? current[userId]?.teamIds ?? [],
          password: "",
        },
      }));
      const teamsResponse = await axios.get(`${API_URL}/teams`, { headers: authHeaders() });
      setTeams(teamsResponse.data as TeamRow[]);
      setInfo(`Usuario ${updated.email} actualizado.`);
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        const status = caughtError.response?.status;
        const message =
          typeof caughtError.response?.data?.message === "string"
            ? caughtError.response?.data?.message
            : Array.isArray(caughtError.response?.data?.message)
              ? caughtError.response?.data?.message.join(". ")
              : "";

        if (status === 403) {
          setError("No tienes permisos para actualizar usuarios con esta cuenta.");
        } else if (message) {
          setError(`No se pudo actualizar el usuario: ${message}`);
        } else {
          setError("No se pudo actualizar el usuario. Revisa los campos e intenta de nuevo.");
        }
      } else {
        setError("No se pudo actualizar el usuario. Revisa los campos e intenta de nuevo.");
      }
    } finally {
      setSavingUserId("");
    }
  };

  const onDeleteUser = async (userId: string) => {
    const user = users.find((item) => item.id === userId);
    if (!user) {
      return;
    }

    if (user.role === "manager") {
      setError("No se puede eliminar un usuario de gerencia.");
      setInfo("");
      return;
    }

    const confirmed = window.confirm(
      `Vas a eliminar al usuario ${user.email}. Esta accion no se puede deshacer. Continuar?`,
    );
    if (!confirmed) {
      return;
    }

    setError("");
    setInfo("");
    setDeletingUserId(userId);

    try {
      await axios.delete(`${API_URL}/users/${userId}`, { headers: authHeaders() });

      setUsers((current) => current.filter((item) => item.id !== userId));
      setTasksForStats((current) => current.filter((task) => task.assigneeId !== userId));
      setUserDrafts((current) => {
        const next = { ...current };
        delete next[userId];
        return next;
      });
      setSelectedStatsUserId((current) => {
        if (current !== userId) {
          return current;
        }

        const remaining = users.filter((item) => item.id !== userId && item.role !== "manager");
        return remaining[0]?.id ?? "";
      });
      const teamsResponse = await axios.get(`${API_URL}/teams`, { headers: authHeaders() });
      setTeams(teamsResponse.data as TeamRow[]);
      setInfo(`Usuario ${user.email} eliminado.`);
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
          setError(`No se pudo eliminar el usuario: ${backendMessage}`);
        } else {
          setError("No se pudo eliminar el usuario.");
        }
      } else {
        setError("No se pudo eliminar el usuario.");
      }
    } finally {
      setDeletingUserId("");
    }
  };

  const onCreateTeam = async () => {
    const trimmedName = newTeamName.trim();
    if (!trimmedName) {
      setError("Escribe un nombre de equipo.");
      setInfo("");
      return;
    }

    setError("");
    setInfo("");
    setCreatingTeam(true);
    try {
      await axios.post(
        `${API_URL}/teams`,
        { name: trimmedName },
        { headers: authHeaders() },
      );

      const teamsResponse = await axios.get(`${API_URL}/teams`, { headers: authHeaders() });
      setTeams(teamsResponse.data as TeamRow[]);
      setNewTeamName("");
      setInfo(`Equipo ${trimmedName} creado.`);
    } catch {
      setError("No se pudo crear el equipo.");
    } finally {
      setCreatingTeam(false);
    }
  };

  const onDeleteTeam = async (teamId: string) => {
    const team = teams.find((item) => item.id === teamId);
    if (!team) {
      return;
    }

    const confirmed = window.confirm(
      `Vas a eliminar el equipo ${team.name}. Sus membresias tambien se eliminaran. Continuar?`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingTeamId(teamId);
    setError("");
    setInfo("");

    try {
      await axios.delete(`${API_URL}/teams/${teamId}`, { headers: authHeaders() });
      const teamsResponse = await axios.get(`${API_URL}/teams`, { headers: authHeaders() });
      setTeams(teamsResponse.data as TeamRow[]);
      setUserDrafts((current) =>
        Object.fromEntries(
          Object.entries(current).map(([userKey, draft]) => [
            userKey,
            {
              ...draft,
              teamIds: draft.teamIds.filter((item) => item !== teamId),
            },
          ]),
        ),
      );
      setInfo(`Equipo ${team.name} eliminado.`);
    } catch {
      setError("No se pudo eliminar el equipo.");
    } finally {
      setDeletingTeamId("");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-10 lg:px-10">
      <section className="glass-panel fade-up p-6 md:p-8 lg:p-10">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">
              Sistema de proyectos
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Usuarios</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-[var(--ink-muted)] md:text-base">
              Gestión de equipo: roles, especialidades, equipos y estadísticas de actividad.
            </p>
          </div>
          {role === "manager" ? (
            <Link
              href="/capture"
              className="ui-btn ui-btn-primary"
            >
              Crear usuario
            </Link>
          ) : null}
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <input
            name="users-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="ui-control"
            placeholder="Buscar por nombre o correo"
          />
          <select
            name="users-role-filter"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className="ui-control"
          >
            <option value="">Todos los roles</option>
            <option value="manager">gerencia</option>
            <option value="lead">lider</option>
            <option value="worker">colaborador</option>
          </select>
          <select
            name="users-status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="ui-control"
          >
            <option value="">Todos los estados</option>
            <option value="active">activos</option>
            <option value="inactive">inactivos</option>
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

      {isManager ? (
        <section className="kpi-card fade-up p-6 md:p-8">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Equipos</h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                Crea equipos y luego asigna miembros desde la tabla de usuarios.
              </p>
            </div>
            <div className="flex w-full gap-2 xl:w-auto">
              <input
                name="users-new-team-name"
                value={newTeamName}
                onChange={(event) => setNewTeamName(event.target.value)}
                className="ui-control w-full xl:w-80"
                placeholder="Nombre del equipo"
              />
              <button
                onClick={() => void onCreateTeam()}
                disabled={creatingTeam}
                className="ui-btn ui-btn-primary disabled:cursor-not-allowed disabled:opacity-70"
              >
                {creatingTeam ? "Creando..." : "Crear"}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {teams.length === 0 ? (
              <p className="text-sm text-[var(--ink-muted)]">No hay equipos creados.</p>
            ) : (
              teams.map((team) => (
                <div
                  key={team.id}
                  className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2"
                >
                  <span className="text-sm font-semibold">{team.name}</span>
                  <span className="text-xs text-[var(--ink-muted)]">
                    {team.memberCount ?? 0} miembros
                  </span>
                  <button
                    onClick={() => void onDeleteTeam(team.id)}
                    disabled={deletingTeamId === team.id}
                    className="ui-btn ui-btn-danger ui-btn-sm disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {deletingTeamId === team.id ? "..." : "Eliminar"}
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      {role === "manager" ? (
      <section className="kpi-card fade-up p-6 md:p-8">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Estadisticas por usuario</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Selecciona un lider o colaborador para ver actividades asignadas y su resumen operativo.
            </p>
          </div>
          <div className="grid w-full gap-3 md:grid-cols-2 xl:w-auto xl:grid-cols-[minmax(0,20rem)_minmax(0,10rem)]">
            <select
              name="users-stats-user"
              value={selectedStatsUserId}
              onChange={(event) => setSelectedStatsUserId(event.target.value)}
              className="ui-control w-full"
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
            <select
              name="users-stats-period"
              value={statsPeriod}
              onChange={(event) => setStatsPeriod(event.target.value as "all" | "7d" | "30d" | "custom")}
              className="ui-control w-full"
            >
              <option value="all">Todo</option>
              <option value="7d">Ultimos 7 dias</option>
              <option value="30d">Ultimos 30 dias</option>
              <option value="custom">Personalizado</option>
            </select>
          </div>
        </div>

        {statsPeriod === "custom" ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:max-w-2xl">
            <input
              name="users-stats-from"
              type="date"
              className="ui-control"
              value={statsFrom}
              onChange={(event) => setStatsFrom(event.target.value)}
            />
            <input
              name="users-stats-to"
              type="date"
              className="ui-control"
              value={statsTo}
              onChange={(event) => setStatsTo(event.target.value)}
            />
          </div>
        ) : null}

        {selectedStatsUser ? (
          <>
            <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <article className="rounded-2xl border border-[var(--line)] bg-white p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">Asignadas</p>
                <p className="mt-2 text-xl font-semibold">{selectedUserTaskSummary.total}</p>
              </article>
              <article className="rounded-2xl border border-[var(--line)] bg-white p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">Abiertas</p>
                <p className="mt-2 text-xl font-semibold text-[var(--accent)]">{selectedUserTaskSummary.active}</p>
              </article>
              <article className="rounded-2xl border border-[var(--line)] bg-white p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">Finalizadas</p>
                <p className="mt-2 text-xl font-semibold text-emerald-700">{selectedUserTaskSummary.done}</p>
              </article>
              <article className="rounded-2xl border border-[var(--line)] bg-white p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">Bloqueadas</p>
                <p className="mt-2 text-xl font-semibold text-[var(--danger)]">{selectedUserTaskSummary.blocked}</p>
              </article>
              <article className="rounded-2xl border border-[var(--line)] bg-white p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">Vencidas</p>
                <p className="mt-2 text-xl font-semibold text-[var(--danger)]">{selectedUserTaskSummary.overdue}</p>
              </article>
              <article className="rounded-2xl border border-[var(--line)] bg-white p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">Urgentes</p>
                <p className="mt-2 text-xl font-semibold text-amber-700">{selectedUserTaskSummary.urgent}</p>
              </article>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(Object.keys(selectedUserTaskSummary.byActivity) as TaskStatsRow["activityType"][]).map((activityType) => (
                <article key={activityType} className="rounded-2xl border border-[var(--line)] bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">{activityTypeLabels[activityType]}</p>
                  <p className="mt-2 text-lg font-semibold">{selectedUserTaskSummary.byActivity[activityType]}</p>
                </article>
              ))}
            </div>

            <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--line)] bg-white">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] bg-[var(--background)]/70 text-left">
                    <th className="px-4 py-3 font-semibold">Tarea</th>
                    <th className="px-4 py-3 font-semibold">Actividad</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3 font-semibold">Prioridad</th>
                    <th className="px-4 py-3 font-semibold">Vence</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedUserTasksByPeriod.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-4 text-center text-[var(--ink-muted)]">
                        Este usuario no tiene tareas asignadas.
                      </td>
                    </tr>
                  ) : (
                    selectedUserTasksByPeriod.map((task) => (
                      <tr key={task.id} className="border-b border-[var(--line)]/60 align-top">
                        <td className="px-4 py-3 font-semibold">{task.title}</td>
                        <td className="px-4 py-3">{activityTypeLabels[task.activityType] ?? task.activityType}</td>
                        <td className="px-4 py-3">{taskStatusLabels[task.status] ?? task.status}</td>
                        <td className="px-4 py-3">{task.priority}</td>
                        <td className="px-4 py-3">{task.dueDate ?? "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => void openDetailsModal()}
                disabled={loadingDetails}
                className="ui-btn ui-btn-secondary disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loadingDetails ? "Cargando detalle..." : "Ver detalle completo"}
              </button>
            </div>
          </>
        ) : (
          <p className="ui-empty mt-4 px-4 py-3 text-sm">
            Selecciona un usuario para ver sus estadisticas.
          </p>
        )}
      </section>
      ) : null}

      <section className="kpi-card fade-up overflow-hidden p-0">
        {loading ? (
          <div className="p-5">
            <div className="ui-skeleton h-6 w-44" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <p className="ui-empty m-4 px-4 py-3 text-sm">No hay usuarios para esos filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="ui-table min-w-full">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--background)]/70 text-left">
                  <th className="px-4 py-3 font-semibold">Nombre</th>
                  <th className="px-4 py-3 font-semibold">Correo</th>
                  <th className="px-4 py-3 font-semibold">Rol</th>
                  <th className="px-4 py-3 font-semibold">Equipos</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Contrasena</th>
                  <th className="px-4 py-3 font-semibold">Creado</th>
                  <th className="px-4 py-3 font-semibold">Accion</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b border-[var(--line)]/60 align-top">
                    <td className="px-4 py-3">
                      {isManager ? (
                        <input
                          name={`user-fullname-${user.id}`}
                          value={userDrafts[user.id]?.fullName ?? user.fullName}
                          onChange={(event) =>
                            setUserDrafts((current) => ({
                              ...current,
                              [user.id]: {
                                ...(current[user.id] ?? buildUserDraft(user)),
                                fullName: event.target.value,
                              },
                            }))
                          }
                          className="w-full min-w-[220px] rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-semibold"
                        />
                      ) : (
                        <span className="font-semibold text-[var(--foreground)]">{user.fullName}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isManager ? (
                        <input
                          name={`user-email-${user.id}`}
                          type="email"
                          value={userDrafts[user.id]?.email ?? user.email}
                          onChange={(event) =>
                            setUserDrafts((current) => ({
                              ...current,
                              [user.id]: {
                                ...(current[user.id] ?? buildUserDraft(user)),
                                email: event.target.value,
                              },
                            }))
                          }
                          className="w-full min-w-[220px] rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                        />
                      ) : (
                        <span className="text-sm text-[var(--foreground)]">{user.email}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isManager ? (
                        <div className="space-y-2">
                          <select
                            name={`user-role-${user.id}`}
                            value={userDrafts[user.id]?.role ?? user.role}
                            onChange={(event) =>
                              setUserDrafts((current) => ({
                                ...current,
                                [user.id]: {
                                  ...(current[user.id] ?? buildUserDraft(user)),
                                  role: event.target.value as UserRow["role"],
                                  specialties:
                                    event.target.value === "lead"
                                      ? (current[user.id]?.specialties ?? toDraftSpecialties(user))
                                      : [],
                                },
                              }))
                            }
                            className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs"
                          >
                            <option value="manager">{roleLabels.manager}</option>
                            <option value="lead">{roleLabels.lead}</option>
                            <option value="worker">{roleLabels.worker}</option>
                          </select>
                          {(userDrafts[user.id]?.role ?? user.role) === "lead" ? (
                            <div className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs">
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                                Especialidades (max 2)
                              </p>
                              <div className="grid gap-1">
                                {LEAD_SPECIALTIES.map((specialty) => {
                                  const selectedSpecialties = userDrafts[user.id]?.specialties ?? toDraftSpecialties(user);
                                  const checked = selectedSpecialties.includes(specialty);

                                  return (
                                    <label key={specialty} className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(event) => {
                                          setUserDrafts((current) => {
                                            const base = current[user.id] ?? buildUserDraft(user);
                                            const currentSpecialties = base.specialties;

                                            if (event.target.checked) {
                                              if (currentSpecialties.length >= 2) {
                                                return current;
                                              }

                                              return {
                                                ...current,
                                                [user.id]: {
                                                  ...base,
                                                  specialties: [...currentSpecialties, specialty],
                                                },
                                              };
                                            }

                                            return {
                                              ...current,
                                              [user.id]: {
                                                ...base,
                                                specialties: currentSpecialties.filter((item) => item !== specialty),
                                              },
                                            };
                                          });
                                        }}
                                      />
                                      {specialtyLabels[specialty]}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-sm text-[var(--foreground)]">
                          {roleLabels[user.role]}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isManager ? (
                        <div className="space-y-1">
                          {teams.length === 0 ? (
                            <span className="text-xs text-[var(--ink-muted)]">Sin equipos</span>
                          ) : (
                            teams.map((team) => {
                              const checked = (userDrafts[user.id]?.teamIds ?? user.teamIds ?? []).includes(team.id);

                              return (
                                <label key={team.id} className="flex items-center gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(event) =>
                                      setUserDrafts((current) => {
                                        const base = current[user.id] ?? buildUserDraft(user);
                                        const currentTeamIds = base.teamIds;

                                        if (event.target.checked) {
                                          if (currentTeamIds.includes(team.id)) {
                                            return current;
                                          }

                                          return {
                                            ...current,
                                            [user.id]: {
                                              ...base,
                                              teamIds: [...currentTeamIds, team.id],
                                            },
                                          };
                                        }

                                        return {
                                          ...current,
                                          [user.id]: {
                                            ...base,
                                            teamIds: currentTeamIds.filter((item) => item !== team.id),
                                          },
                                        };
                                      })
                                    }
                                  />
                                  {team.name}
                                </label>
                              );
                            })
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-[var(--ink-muted)]">
                          {(user.teamIds ?? []).length > 0
                            ? teams
                                .filter((team) => (user.teamIds ?? []).includes(team.id))
                                .map((team) => team.name)
                                .join(", ")
                            : "Sin equipo"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isManager ? (
                        <select
                          name={`user-status-${user.id}`}
                          value={(userDrafts[user.id]?.isActive ?? user.isActive) ? "active" : "inactive"}
                          onChange={(event) =>
                            setUserDrafts((current) => ({
                              ...current,
                              [user.id]: {
                                ...(current[user.id] ?? buildUserDraft(user)),
                                isActive: event.target.value === "active",
                              },
                            }))
                          }
                          className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs"
                        >
                          <option value="active">activo</option>
                          <option value="inactive">inactivo</option>
                        </select>
                      ) : (
                        <span className="text-sm text-[var(--foreground)]">
                          {user.isActive ? "activo" : "inactivo"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isManager ? (
                        <input
                          name={`user-password-${user.id}`}
                          type="password"
                          value={userDrafts[user.id]?.password ?? ""}
                          onChange={(event) =>
                            setUserDrafts((current) => ({
                              ...current,
                              [user.id]: {
                                ...(current[user.id] ?? buildUserDraft(user)),
                                password: event.target.value,
                              },
                            }))
                          }
                          className="w-full min-w-[220px] rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs"
                          placeholder="Nueva contrasena (opcional)"
                        />
                      ) : (
                        <span className="text-sm text-[var(--ink-muted)]">Solo gerencia</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{new Date(user.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      {isManager ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => void onSaveUser(user.id)}
                            disabled={savingUserId === user.id}
                            className="ui-btn ui-btn-primary ui-btn-sm disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {savingUserId === user.id ? "Guardando..." : "Guardar"}
                          </button>
                          <button
                            onClick={() => void onDeleteUser(user.id)}
                            disabled={deletingUserId === user.id || user.role === "manager"}
                            className="ui-btn ui-btn-danger ui-btn-sm disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {deletingUserId === user.id ? "Eliminando..." : "Eliminar"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--ink-muted)]">Sin permisos</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isDetailsModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4"
          onClick={() => setIsDetailsModalOpen(false)}
        >
          <div
            className="w-full max-w-4xl rounded-2xl border border-[var(--line)] bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                  Historial de actividad
                </p>
                <h3 className="mt-1 text-lg font-semibold">
                  {selectedStatsUser ? selectedStatsUser.fullName : "Usuario"}
                </h3>
              </div>
              <button
                onClick={() => setIsDetailsModalOpen(false)}
                className="ui-btn ui-btn-secondary ui-btn-sm"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--line)] bg-white">
              <table className="ui-table min-w-full">
                <thead>
                  <tr className="border-b border-[var(--line)] bg-[var(--background)]/70 text-left">
                    <th className="px-4 py-3 font-semibold">Fecha</th>
                    <th className="px-4 py-3 font-semibold">Tarea</th>
                    <th className="px-4 py-3 font-semibold">Horas</th>
                    <th className="px-4 py-3 font-semibold">Progreso</th>
                    <th className="px-4 py-3 font-semibold">Comentario</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedUserUpdates.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-4 text-center text-[var(--ink-muted)]">
                        No hay actualizaciones para el periodo seleccionado.
                      </td>
                    </tr>
                  ) : (
                    selectedUserUpdates.map((update) => (
                      <tr key={update.id} className="border-b border-[var(--line)]/60 align-top">
                        <td className="px-4 py-3">{update.updateDate}</td>
                        <td className="px-4 py-3 font-semibold">{taskTitleById[update.taskId] ?? update.taskId.slice(0, 8)}</td>
                        <td className="px-4 py-3">{update.workedHours}</td>
                        <td className="px-4 py-3">{update.progressPercent}%</td>
                        <td className="px-4 py-3">{update.comments ?? "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
