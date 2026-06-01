"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL, authHeaders, getStoredEmail, getStoredRole, getStoredToken } from "../../lib/api";
import { LEAD_SPECIALTIES, specialtyLabels, type LeadSpecialty } from "../../lib/specialties";

type UserRow = {
  id: string;
  fullName: string;
  email: string;
  role: "manager" | "lead" | "worker";
  specialty?: LeadSpecialty | null;
  isActive: boolean;
  createdAt: string;
};

const roleLabels: Record<UserRow["role"], string> = {
  manager: "gerencia",
  lead: "lider",
  worker: "trabajador",
};

export default function UsersPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [savingUserId, setSavingUserId] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userDrafts, setUserDrafts] = useState<
    Record<string, { fullName: string; role: UserRow["role"]; specialty: LeadSpecialty | ""; isActive: boolean; password: string }>
  >({});

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
    if (savedRole === "worker") {
      router.replace("/tasks");
      return;
    }

    setEmail(getStoredEmail());
    setRole(savedRole);

    const loadUsers = async () => {
      try {
        const response = await axios.get(`${API_URL}/users`, {
          headers: authHeaders(),
        });

        const loadedUsers = response.data as UserRow[];
        setUsers(loadedUsers);
        setUserDrafts(
          Object.fromEntries(
            loadedUsers.map((user) => [
              user.id,
              {
                fullName: user.fullName,
                role: user.role,
                specialty: user.specialty ?? "",
                isActive: user.isActive,
                password: "",
              },
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

  const onSaveUser = async (userId: string) => {
    const draft = userDrafts[userId];
    const user = users.find((item) => item.id === userId);

    if (!draft || !user) {
      return;
    }

    if (draft.role === "lead" && !draft.specialty) {
      setError("Para asignar rol de lider debes seleccionar una especialidad.");
      setInfo("");
      return;
    }

    const sensitiveChanges: string[] = [];
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

    try {
      const response = await axios.patch(
        `${API_URL}/users/${userId}`,
        {
          fullName: draft.fullName,
          role: draft.role,
          specialty: draft.role === "lead" ? draft.specialty || undefined : null,
          isActive: draft.isActive,
          password: draft.password.trim().length > 0 ? draft.password : undefined,
        },
        { headers: authHeaders() },
      );

      const updated = response.data as UserRow;
      setUsers((current) =>
        current.map((item) => (item.id === userId ? { ...item, ...updated } : item)),
      );
      setUserDrafts((current) => ({
        ...current,
        [userId]: {
          ...(current[userId] ?? {
            fullName: updated.fullName,
            role: updated.role,
            specialty: updated.specialty ?? "",
            isActive: updated.isActive,
            password: "",
          }),
          password: "",
        },
      }));
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

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <section className="glass-panel fade-up p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">
              Sistema de proyectos
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Usuarios</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--ink-muted)] md:text-base">
              {email ? `Sesion activa como ${email}.` : "Sesion activa."} Aqui puedes ver los usuarios creados y filtrar por rol.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold transition hover:bg-[var(--background)]"
            >
              Volver al panel
            </Link>
            {role === "manager" ? (
              <Link
                href="/capture"
                className="rounded-full border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
              >
                Crear usuario
              </Link>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
            placeholder="Buscar por nombre o correo"
          />
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
          >
            <option value="">Todos los roles</option>
            <option value="manager">gerencia</option>
            <option value="lead">lider</option>
            <option value="worker">trabajador</option>
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
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

      <section className="kpi-card fade-up overflow-hidden p-0">
        {loading ? (
          <p className="p-5 text-sm text-[var(--ink-muted)]">Cargando usuarios...</p>
        ) : filteredUsers.length === 0 ? (
          <p className="p-5 text-sm text-[var(--ink-muted)]">No hay usuarios para esos filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--background)]/70 text-left">
                  <th className="px-4 py-3 font-semibold">Nombre</th>
                  <th className="px-4 py-3 font-semibold">Correo</th>
                  <th className="px-4 py-3 font-semibold">Rol</th>
                  <th className="px-4 py-3 font-semibold">Especialidad</th>
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
                          value={userDrafts[user.id]?.fullName ?? user.fullName}
                          onChange={(event) =>
                            setUserDrafts((current) => ({
                              ...current,
                              [user.id]: {
                                ...(current[user.id] ?? {
                                  fullName: user.fullName,
                                  role: user.role,
                                  specialty: user.specialty ?? "",
                                  isActive: user.isActive,
                                  password: "",
                                }),
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
                    <td className="px-4 py-3">{user.email}</td>
                    <td className="px-4 py-3">
                      {isManager ? (
                        <div className="space-y-2">
                          <select
                            value={userDrafts[user.id]?.role ?? user.role}
                            onChange={(event) =>
                              setUserDrafts((current) => ({
                                ...current,
                                [user.id]: {
                                  ...(current[user.id] ?? {
                                    fullName: user.fullName,
                                    role: user.role,
                                    specialty: user.specialty ?? "",
                                    isActive: user.isActive,
                                    password: "",
                                  }),
                                  role: event.target.value as UserRow["role"],
                                  specialty:
                                    event.target.value === "lead"
                                      ? (current[user.id]?.specialty ?? "")
                                      : "",
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
                            <select
                              value={userDrafts[user.id]?.specialty ?? user.specialty ?? ""}
                              onChange={(event) =>
                                setUserDrafts((current) => ({
                                  ...current,
                                  [user.id]: {
                                    ...(current[user.id] ?? {
                                      fullName: user.fullName,
                                      role: user.role,
                                      specialty: user.specialty ?? "",
                                      isActive: user.isActive,
                                      password: "",
                                    }),
                                    specialty: event.target.value as LeadSpecialty,
                                  },
                                }))
                              }
                              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs"
                            >
                              <option value="">Especialidad</option>
                              {LEAD_SPECIALTIES.map((specialty) => (
                                <option key={specialty} value={specialty}>
                                  {specialtyLabels[specialty]}
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-sm text-[var(--foreground)]">
                          {roleLabels[user.role]}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {user.specialty ? specialtyLabels[user.specialty] : "-"}
                    </td>
                    <td className="px-4 py-3">
                      {isManager ? (
                        <select
                          value={(userDrafts[user.id]?.isActive ?? user.isActive) ? "active" : "inactive"}
                          onChange={(event) =>
                            setUserDrafts((current) => ({
                              ...current,
                              [user.id]: {
                                ...(current[user.id] ?? {
                                  fullName: user.fullName,
                                  role: user.role,
                                  specialty: user.specialty ?? "",
                                  isActive: user.isActive,
                                  password: "",
                                }),
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
                          type="password"
                          value={userDrafts[user.id]?.password ?? ""}
                          onChange={(event) =>
                            setUserDrafts((current) => ({
                              ...current,
                              [user.id]: {
                                ...(current[user.id] ?? {
                                  fullName: user.fullName,
                                  role: user.role,
                                  specialty: user.specialty ?? "",
                                  isActive: user.isActive,
                                  password: "",
                                }),
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
                        <button
                          onClick={() => void onSaveUser(user.id)}
                          disabled={savingUserId === user.id}
                          className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {savingUserId === user.id ? "Guardando..." : "Guardar"}
                        </button>
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
    </div>
  );
}
