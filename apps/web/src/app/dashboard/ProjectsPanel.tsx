"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LEAD_SPECIALTIES, specialtyLabels, type LeadSpecialty } from "../../lib/specialties";
import {
  buildPortfolioRows,
  computeProjectKpis,
  filterPortfolioRows,
} from "./metrics";
import {
  projectStatusLabels,
  riskLabelMap,
  type ProjectProgress,
  type ProjectRow,
  type RiskLevel,
} from "./types";

export default function ProjectsPanel({
  projects,
  progressById,
  role,
  onCreateTask,
}: {
  projects: ProjectRow[];
  progressById: Record<string, ProjectProgress>;
  role: string;
  onCreateTask: (projectId: string) => void;
}) {
  const [projectSearch, setProjectSearch] = useState("");
  const [projectStatusFilter, setProjectStatusFilter] = useState<"" | ProjectRow["status"]>("");
  const [projectSpecialtyFilter, setProjectSpecialtyFilter] = useState<"" | LeadSpecialty>("");
  const [projectRiskFilter, setProjectRiskFilter] = useState<"all" | RiskLevel>("all");
  const [projectsExpanded, setProjectsExpanded] = useState(false);

  const projectPortfolioRows = useMemo(
    () => buildPortfolioRows(projects, progressById),
    [projects, progressById],
  );

  const filteredProjectRows = useMemo(
    () =>
      filterPortfolioRows(projectPortfolioRows, {
        search: projectSearch,
        status: projectStatusFilter,
        specialty: projectSpecialtyFilter,
        risk: projectRiskFilter,
      }),
    [projectPortfolioRows, projectRiskFilter, projectSearch, projectSpecialtyFilter, projectStatusFilter],
  );

  const projectKpis = useMemo(() => computeProjectKpis(projectPortfolioRows), [projectPortfolioRows]);

  return (
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

          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
            <p className="text-sm text-[var(--ink-muted)]">
              {projectsExpanded
                ? `Mostrando ${filteredProjectRows.length} proyecto(s) en el listado.`
                : "Lista de proyectos"}
            </p>
            <button
              type="button"
              onClick={() => setProjectsExpanded((current) => !current)}
              className="ui-btn ui-btn-secondary ui-btn-sm"
            >
              {projectsExpanded ? "Ocultar proyectos" : "Desplegar proyectos"}
            </button>
          </div>

          {projectsExpanded ? (
            <>
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
                  name="dashboard-project-specialty-filter"
                  value={projectSpecialtyFilter}
                  onChange={(event) => setProjectSpecialtyFilter(event.target.value as "" | LeadSpecialty)}
                  className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm"
                >
                  <option value="">Todas las especialidades</option>
                  {LEAD_SPECIALTIES.map((specialty) => (
                    <option key={specialty} value={specialty}>
                      {specialtyLabels[specialty]}
                    </option>
                  ))}
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
                                href={`/tasks?projectId=${project.id}&showDone=1`}
                                className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs font-semibold"
                              >
                                Tareas
                              </Link>
                              {role === "manager" || role === "lead" ? (
                                <button
                                  onClick={() => onCreateTask(project.id)}
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
            </>
          ) : null}
        </article>
  );
}
