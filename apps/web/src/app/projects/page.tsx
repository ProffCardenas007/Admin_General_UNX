"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL, authHeaders, getStoredEmail, getStoredRole, getStoredToken } from "../../lib/api";
import { specialtyLabels, type LeadSpecialty } from "../../lib/specialties";

type ProjectRow = {
  id: string;
  code: string;
  name: string;
  ownerTeamId?: string;
  scope?: LeadSpecialty | null;
  status: "planned" | "active" | "on_hold" | "done" | "cancelled";
  startDate?: string;
  endDate?: string;
  createdAt: string;
};

const statusLabels: Record<ProjectRow["status"], string> = {
  planned: "planificado",
  active: "activo",
  on_hold: "en pausa",
  done: "finalizado",
  cancelled: "cancelado",
};

export default function ProjectsPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [deletingProjectId, setDeletingProjectId] = useState("");

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

    setEmail(getStoredEmail());
    setRole(savedRole);

    const loadProjects = async () => {
      try {
        const response = await axios.get(`${API_URL}/projects`, {
          headers: authHeaders(),
        });

        setProjects(response.data as ProjectRow[]);
      } catch {
        setError("No se pudo cargar el listado de proyectos.");
      } finally {
        setLoading(false);
      }
    };

    void loadProjects();
  }, [router]);

  const onDeleteProject = async (projectId: string) => {
    if (role !== "manager") {
      return;
    }

    const project = projects.find((item) => item.id === projectId);
    if (!project) {
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
      setError("No se pudo borrar el proyecto. Esta accion es exclusiva de gerencia.");
    } finally {
      setDeletingProjectId("");
    }
  };

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const bySearch =
        search.trim().length === 0 ||
        project.code.toLowerCase().includes(search.toLowerCase()) ||
        project.name.toLowerCase().includes(search.toLowerCase());

      const byStatus = statusFilter.length === 0 || project.status === statusFilter;

      return bySearch && byStatus;
    });
  }, [projects, search, statusFilter]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <section className="glass-panel fade-up p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">
              Sistema de proyectos
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Proyectos</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--ink-muted)] md:text-base">
              {email ? `Sesion activa como ${email}.` : "Sesion activa."} Aqui se visualizan todos los proyectos.
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
              href="/capture?mode=project"
              className="rounded-full border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Crear proyecto
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
            placeholder="Buscar por codigo o nombre"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
          >
            <option value="">Todos los estados</option>
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
          <p className="p-5 text-sm text-[var(--ink-muted)]">Cargando proyectos...</p>
        ) : filteredProjects.length === 0 ? (
          <p className="p-5 text-sm text-[var(--ink-muted)]">No hay proyectos para esos filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--background)]/70 text-left">
                  <th className="px-4 py-3 font-semibold">Codigo</th>
                  <th className="px-4 py-3 font-semibold">Nombre</th>
                  <th className="px-4 py-3 font-semibold">Academia</th>
                  <th className="px-4 py-3 font-semibold">Especialidad</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Inicio</th>
                  <th className="px-4 py-3 font-semibold">Fin</th>
                  <th className="px-4 py-3 font-semibold">Creado</th>
                  {role === "manager" ? <th className="px-4 py-3 font-semibold">Accion</th> : null}
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((project) => (
                  <tr key={project.id} className="border-b border-[var(--line)]/60 align-top">
                    <td className="px-4 py-3 font-mono text-xs">{project.code}</td>
                    <td className="px-4 py-3 font-semibold">{project.name}</td>
                    <td className="px-4 py-3">{project.ownerTeamId ?? "-"}</td>
                    <td className="px-4 py-3">{project.scope ? specialtyLabels[project.scope] : "-"}</td>
                    <td className="px-4 py-3">{statusLabels[project.status] ?? project.status}</td>
                    <td className="px-4 py-3">{project.startDate ?? "-"}</td>
                    <td className="px-4 py-3">{project.endDate ?? "-"}</td>
                    <td className="px-4 py-3">{new Date(project.createdAt).toLocaleDateString()}</td>
                    {role === "manager" ? (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => void onDeleteProject(project.id)}
                          disabled={deletingProjectId === project.id}
                          className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 py-2 text-xs font-semibold text-[var(--danger)] transition hover:bg-[var(--danger)]/20 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {deletingProjectId === project.id ? "Borrando..." : "Borrar"}
                        </button>
                      </td>
                    ) : null}
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
