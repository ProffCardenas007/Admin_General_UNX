"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { useRouter } from "next/navigation";
import { API_URL, authHeaders, getStoredRole, getStoredToken } from "../../lib/api";
import { specialtyLabels, type LeadSpecialty } from "../../lib/specialties";
import { groupHoursByLabel } from "./reportLogic";

type TaskRow = {
  id: string;
  projectId: string;
  assigneeId?: string;
  status?: "todo" | "doing" | "blocked" | "done";
  dueDate?: string;
  estimatedHours?: string;
  createdAt?: string;
};

type ProjectRow = {
  id: string;
  code: string;
  name: string;
  scope?: LeadSpecialty | null;
};

type UserRow = {
  id: string;
  fullName: string;
  role: "manager" | "lead" | "worker";
};

type ClassHourBreakdown = {
  program: string;
  activityType: string;
  hours: number;
  sessionsCount: number;
};

type ClassHoursRow = {
  userId: string;
  classHours: number;
  sessionsCount: number;
  breakdown: ClassHourBreakdown[];
};

type HalfMonth = "first" | "second";

const chartPalette = [
  "#2f6fed",
  "#0ea5a4",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
  "#64748b",
];

const toDateKey = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const getQuincenaRange = (yearMonth: string, half: HalfMonth) => {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const monthIndex = month - 1;

  if (monthIndex < 0 || monthIndex > 11) {
    return null;
  }

  const startDate = new Date(year, monthIndex, half === "first" ? 1 : 16);
  const endDate = half === "first"
    ? new Date(year, monthIndex, 15)
    : new Date(year, monthIndex + 1, 0);

  return {
    startDate,
    endDate,
    startKey: toDateKey(startDate),
    endKey: toDateKey(endDate),
  };
};

const buildConicGradient = (rows: Array<{ pct: number }>) => {
  if (rows.length === 0) {
    return "conic-gradient(#dbe2f1 0% 100%)";
  }

  let acc = 0;
  const segments = rows.map((row, index) => {
    const start = acc;
    const end = Math.min(acc + row.pct, 100);
    acc = end;
    const color = chartPalette[index % chartPalette.length];
    return `${color} ${start}% ${end}%`;
  });

  if (acc < 100) {
    segments.push(`#dbe2f1 ${acc}% 100%`);
  }

  return `conic-gradient(${segments.join(", ")})`;
};

export default function QuincenasPage() {
  const router = useRouter();

  const onGeneratePdf = async () => {
    try {
      setError("");

      const [{ jsPDF }, autoTableModule] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const autoTable = autoTableModule.default;

      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const marginX = 40;
      let cursorY = 46;

      const quincenaLabel = halfMonth === "first" ? "1 al 15" : "16 al fin de mes";
      const dateRangeLabel = quincenaRange
        ? `${quincenaRange.startKey} a ${quincenaRange.endKey}`
        : "Rango no disponible";

      doc.setFontSize(17);
      doc.text("Reporte de gerencia", marginX, cursorY);

      cursorY += 20;
      doc.setFontSize(10);
      doc.text(`Periodo: ${yearMonth} · Quincena: ${quincenaLabel}`, marginX, cursorY);
      cursorY += 14;
      doc.text(`Rango: ${dateRangeLabel}`, marginX, cursorY);
      cursorY += 14;
      doc.text(
        "El periodo filtra las clases; las tareas incluyen todas las horas estimadas asignadas.",
        marginX,
        cursorY,
      );
      cursorY += 14;
      doc.text(
        `Horas totales: ${totalWorkHours.toFixed(2)} h · Tareas/proyectos: ${totalProjectHours.toFixed(2)} h · Clase: ${totalClassHours.toFixed(2)} h`,
        marginX,
        cursorY,
      );

      autoTable(doc, {
        startY: cursorY + 16,
        head: [["Proyecto", "Academia - Especialidad", "Horas asignadas", "Tareas", "% tareas"]],
        body:
          projectSummary.length === 0
            ? [["Sin datos", "-", "0.00 h", "0", "0.0%"]]
            : projectSummary.map((row) => {
                const pct = totalProjectHours > 0 ? (row.hours / totalProjectHours) * 100 : 0;
                return [
                  `${row.projectCode} · ${row.projectName}`,
                  row.specialtyAcademy,
                  `${row.hours.toFixed(2)} h`,
                  String(row.tasks),
                  `${pct.toFixed(1)}%`,
                ];
              }),
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: [47, 111, 237] },
      });

      cursorY =
        ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
          ?.finalY ?? cursorY + 16) + 20;

      autoTable(doc, {
        startY: cursorY,
        head: [["Programa", "Actividad docente", "Horas", "Clases", "% docente", "% total"]],
        body:
          teachingDistribution.length === 0
            ? [["Sin datos", "-", "0.00 h", "0", "0.0%", "0.0%"]]
            : teachingDistribution.map((row) => [
                row.program,
                row.activityType,
                `${row.hours.toFixed(2)} h`,
                String(row.sessionsCount),
                `${(totalClassHours > 0 ? (row.hours / totalClassHours) * 100 : 0).toFixed(1)}%`,
                `${(totalWorkHours > 0 ? (row.hours / totalWorkHours) * 100 : 0).toFixed(1)}%`,
              ]),
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: [11, 79, 108] },
      });

      cursorY =
        ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
          ?.finalY ?? cursorY) + 20;

      autoTable(doc, {
        startY: cursorY,
        head: [["Distribucion general del equipo", "Horas", "Participacion"]],
        body:
          teamSpecialtyDistribution.length === 0
            ? [["Sin datos", "0.00 h", "0.0%"]]
            : teamSpecialtyDistribution.map((row) => [
                row.specialty,
                `${row.hours.toFixed(2)} h`,
                `${row.pct.toFixed(1)}%`,
              ]),
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: [14, 165, 164] },
      });

      cursorY =
        ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
          ?.finalY ?? cursorY) + 20;

      autoTable(doc, {
        startY: cursorY,
        head: [["Profesor", "Total", "Tareas/proyectos", "Clase", "Clases", "Distribución"]],
        body:
          personStats.length === 0
            ? [["Sin datos", "0.00 h", "0.00 h", "0.00 h", "0", "-"]]
            : personStats.map((person) => [
                person.fullName,
                `${person.totalHours.toFixed(2)} h`,
                `${person.administrativeHours.toFixed(2)} h`,
                `${person.teachingHours.toFixed(2)} h`,
                String(person.sessionsCount),
                person.distribution
                  .map((row) => `${row.label}: ${row.pct.toFixed(1)}%`)
                  .join(" | "),
              ]),
        styles: { fontSize: 8.5, cellPadding: 5 },
        headStyles: { fillColor: [245, 158, 11] },
        columnStyles: {
          5: { cellWidth: 210 },
        },
      });

      const fileHalf = halfMonth === "first" ? "01-15" : "16-fin";
      doc.save(`reporte-gerencia-${yearMonth}-${fileHalf}.pdf`);
    } catch {
      setError("No se pudo generar el PDF estructurado del reporte.");
    }
  };

  const now = new Date();
  const [yearMonth, setYearMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [halfMonth, setHalfMonth] = useState<HalfMonth>(now.getDate() <= 15 ? "first" : "second");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [classHours, setClassHours] = useState<ClassHoursRow[]>([]);
  const [classHoursLoading, setClassHoursLoading] = useState(false);

  const projectsById = useMemo(
    () => Object.fromEntries(projects.map((project) => [project.id, project])),
    [projects],
  );

  const academiaEspecialidadLabel = (project?: ProjectRow) => {
    const academia = project?.code?.trim().length ? project.code.trim() : "Sin academia";
    const especialidad = project?.scope ? specialtyLabels[project.scope] : "Sin especialidad";
    return `${academia} - ${especialidad}`;
  };

  const quincenaRange = useMemo(
    () => getQuincenaRange(yearMonth, halfMonth),
    [halfMonth, yearMonth],
  );

  const filteredAssignedTasks = useMemo(
    () => tasks.filter((task) => Boolean(task.assigneeId)),
    [tasks],
  );

  const projectSummary = useMemo(() => {
    const grouped = new Map<string, { id: string; projectName: string; projectCode: string; specialtyAcademy: string; hours: number; tasks: number }>();

    filteredAssignedTasks.forEach((task) => {
      const project = projectsById[task.projectId];
      const projectName = project?.name ?? "Proyecto no encontrado";
      const projectCode = project?.code ?? "-";
      const hours = Number(task.estimatedHours ?? 0);

      const current = grouped.get(task.projectId) ?? {
        id: task.projectId,
        projectName,
        projectCode,
        specialtyAcademy: academiaEspecialidadLabel(project),
        hours: 0,
        tasks: 0,
      };

      current.hours += Number.isFinite(hours) ? hours : 0;
      current.tasks += 1;
      grouped.set(task.projectId, current);
    });

    return [...grouped.values()].sort((a, b) => b.hours - a.hours);
  }, [filteredAssignedTasks, projectsById]);

  const totalProjectHours = useMemo(
    () => projectSummary.reduce((sum, row) => sum + row.hours, 0),
    [projectSummary],
  );

  const totalClassHours = useMemo(
    () => classHours.reduce((sum, row) => sum + row.classHours, 0),
    [classHours],
  );

  const totalClassSessions = useMemo(
    () => classHours.reduce((sum, row) => sum + row.sessionsCount, 0),
    [classHours],
  );

  const totalWorkHours = totalProjectHours + totalClassHours;

  const teachingDistribution = useMemo(() => {
    const grouped = new Map<string, ClassHourBreakdown>();

    classHours.forEach((person) => {
      person.breakdown.forEach((row) => {
        const key = `${row.program}|${row.activityType}`;
        const current = grouped.get(key) ?? {
          program: row.program,
          activityType: row.activityType,
          hours: 0,
          sessionsCount: 0,
        };
        current.hours += row.hours;
        current.sessionsCount += row.sessionsCount;
        grouped.set(key, current);
      });
    });

    return [...grouped.values()].sort(
      (first, second) =>
        second.hours - first.hours ||
        `${first.program}-${first.activityType}`.localeCompare(
          `${second.program}-${second.activityType}`,
          "es",
        ),
    );
  }, [classHours]);

  const teamSpecialtyDistribution = useMemo(() => {
    const rows = groupHoursByLabel(
      filteredAssignedTasks.map((task) => ({
        label: academiaEspecialidadLabel(projectsById[task.projectId]),
        hours: Number(task.estimatedHours ?? 0),
      })),
    )
      .map((row) => ({
        specialty: row.label,
        hours: row.hours,
        pct: totalProjectHours > 0 ? (row.hours / totalProjectHours) * 100 : 0,
      }));

    return rows;
  }, [filteredAssignedTasks, projectsById, totalProjectHours]);

  const teamDonutStyle = useMemo(
    () => ({ background: buildConicGradient(teamSpecialtyDistribution.map((row) => ({ pct: row.pct }))) }),
    [teamSpecialtyDistribution],
  );

  const personStats = useMemo(() => {
    const workerList = users.filter((user) => user.role !== "manager");
    const classHoursByUserId = new Map(classHours.map((row) => [row.userId, row]));

    return workerList
      .map((user) => {
        const userTasks = filteredAssignedTasks.filter((task) => task.assigneeId === user.id);
        const administrativeHours = userTasks.reduce(
          (sum, task) => sum + Number(task.estimatedHours ?? 0),
          0,
        );
        const userClassHours = classHoursByUserId.get(user.id);
        const teachingHours = userClassHours?.classHours ?? 0;
        const totalHours = administrativeHours + teachingHours;

        const specialtyRows = groupHoursByLabel(
          userTasks.map((task) => ({
            label: academiaEspecialidadLabel(projectsById[task.projectId]),
            hours: Number(task.estimatedHours ?? 0),
          })),
        )
          .map((row) => ({
            specialty: row.label,
            hours: row.hours,
            pct: administrativeHours > 0 ? (row.hours / administrativeHours) * 100 : 0,
          }))
          .sort((a, b) => b.hours - a.hours);

        const distribution = [
          ...specialtyRows.map((row) => ({
            label: `Tarea/proyecto · ${row.specialty}`,
            hours: row.hours,
          })),
          ...(userClassHours?.breakdown.map((row) => ({
            label: `Clase · ${row.program} · ${row.activityType}`,
            hours: row.hours,
          })) ?? []),
        ]
          .map((row) => ({
            ...row,
            pct: totalHours > 0 ? (row.hours / totalHours) * 100 : 0,
          }))
          .sort((first, second) => second.hours - first.hours);

        return {
          id: user.id,
          fullName: user.fullName,
          role: user.role,
          totalHours,
          administrativeHours,
          teachingHours,
          sessionsCount: userClassHours?.sessionsCount ?? 0,
          tasksCount: userTasks.length,
          specialties: specialtyRows,
          teaching: userClassHours?.breakdown ?? [],
          distribution,
        };
      })
      .filter((user) => user.totalHours > 0)
      .sort((a, b) => b.totalHours - a.totalHours);
  }, [classHours, filteredAssignedTasks, projectsById, users]);

  useEffect(() => {
    const token = getStoredToken();
    const role = getStoredRole();

    if (!token) {
      router.replace("/");
      return;
    }

    if (role !== "manager") {
      router.replace("/dashboard");
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        setError("");

        const headers = authHeaders();
        const [tasksResponse, projectsResponse, usersResponse] = await Promise.all([
          axios.get(`${API_URL}/tasks`, { headers }),
          axios.get(`${API_URL}/projects`, { headers }),
          axios.get(`${API_URL}/users`, { headers }),
        ]);

        setTasks(tasksResponse.data as TaskRow[]);
        setProjects(projectsResponse.data as ProjectRow[]);
        setUsers(usersResponse.data as UserRow[]);
      } catch {
        setError("No se pudo cargar el resumen quincenal.");
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, [router]);

  useEffect(() => {
    if (!getStoredToken() || getStoredRole() !== "manager" || !quincenaRange) {
      return;
    }

    let cancelled = false;
    const loadClassHours = async () => {
      try {
        setClassHoursLoading(true);
        const { data } = await axios.get<ClassHoursRow[]>(
          `${API_URL}/class-planning/session-hours`,
          {
            headers: authHeaders(),
            params: {
              from: quincenaRange.startKey,
              to: quincenaRange.endKey,
            },
          },
        );
        if (!cancelled) setClassHours(data);
      } catch {
        if (!cancelled) {
          setClassHours([]);
          setError("No se pudieron cargar las horas de clase del periodo.");
        }
      } finally {
        if (!cancelled) setClassHoursLoading(false);
      }
    };

    void loadClassHours();
    return () => {
      cancelled = true;
    };
  }, [quincenaRange]);

  if (loading) {
    return (
      <section className="mx-auto w-full max-w-7xl p-4 md:p-6">
        <article className="kpi-card p-5">
          <h1 className="text-2xl font-semibold">Resumen quincenal</h1>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">Cargando datos...</p>
        </article>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
      <article className="kpi-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Reporte de gerencia</h1>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Gasto de tiempo por profesor: horas asignadas en tareas/proyectos y clases impartidas por programa y actividad.
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <button type="button" onClick={onGeneratePdf} className="ui-btn ui-btn-primary ui-btn-sm">
              Generar PDF
            </button>
            <Link href="/dashboard" className="ui-btn ui-btn-secondary ui-btn-sm">Volver al dashboard</Link>
          </div>
        </div>

        <p className="mt-2 text-xs text-[var(--ink-muted)] print:hidden">
          El boton Generar PDF crea un documento estructurado con tablas y porcentajes del reporte.
          El periodo seleccionado filtra las clases; las tareas/proyectos incluyen todas las horas estimadas asignadas en la plataforma.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(180px,220px),minmax(170px,220px),1fr]">
          <label className="text-xs text-[var(--ink-muted)]">
            Mes
            <input
              type="month"
              value={yearMonth}
              onChange={(event) => setYearMonth(event.target.value)}
              className="mt-1 block w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
            />
          </label>

          <label className="text-xs text-[var(--ink-muted)]">
            Quincena
            <select
              value={halfMonth}
              onChange={(event) => setHalfMonth(event.target.value as HalfMonth)}
              className="mt-1 block w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
            >
              <option value="first">1 al 15</option>
              <option value="second">16 al fin de mes</option>
            </select>
          </label>

          <div className="flex items-end">
            <p className="rounded-xl border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--ink-muted)]">
              {quincenaRange
                ? `Rango: ${quincenaRange.startKey} a ${quincenaRange.endKey}`
                : "Selecciona un mes valido"}
            </p>
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}
      </article>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="kpi-card p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Horas totales</p>
          <p className="mt-2 text-3xl font-semibold">{totalWorkHours.toFixed(2)} h</p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">Base para porcentajes de gasto</p>
        </article>
        <article className="kpi-card p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Tareas / proyectos</p>
          <p className="mt-2 text-3xl font-semibold">{totalProjectHours.toFixed(2)} h</p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            {(totalWorkHours > 0 ? (totalProjectHours / totalWorkHours) * 100 : 0).toFixed(1)}% del total
          </p>
        </article>
        <article className="kpi-card p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Horas de clase</p>
          <p className="mt-2 text-3xl font-semibold">
            {classHoursLoading ? "…" : `${totalClassHours.toFixed(2)} h`}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            {(totalWorkHours > 0 ? (totalClassHours / totalWorkHours) * 100 : 0).toFixed(1)}% del total
          </p>
        </article>
        <article className="kpi-card p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Clases impartidas</p>
          <p className="mt-2 text-3xl font-semibold">{classHoursLoading ? "…" : totalClassSessions}</p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">Incluye coberturas del profesor sustituto</p>
        </article>
      </div>

      <article className="kpi-card p-5">
        <h2 className="text-lg font-semibold">Horas docentes por programa y actividad</h2>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          PAA y EXANI-II separados en clase regular, regularización, asesoría, aplicación y explicación de examen.
        </p>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">
          Los horarios importados que indican EXANI se clasifican como EXANI-II; los demás corresponden a PAA según el formato actual.
        </p>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--line)] bg-white">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--background)]/60 text-left">
                <th className="px-3 py-3 font-semibold">Programa</th>
                <th className="px-3 py-3 font-semibold">Actividad</th>
                <th className="px-3 py-3 font-semibold">Horas</th>
                <th className="px-3 py-3 font-semibold">Clases</th>
                <th className="px-3 py-3 font-semibold">% horas docentes</th>
                <th className="px-3 py-3 font-semibold">% gasto total</th>
              </tr>
            </thead>
            <tbody>
              {teachingDistribution.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-[var(--ink-muted)]">
                    {classHoursLoading ? "Cargando horas de clase…" : "No hay clases en la quincena seleccionada."}
                  </td>
                </tr>
              ) : (
                teachingDistribution.map((row) => (
                  <tr key={`${row.program}-${row.activityType}`} className="border-b border-[var(--line)]/50">
                    <td className="px-3 py-3 font-semibold">{row.program}</td>
                    <td className="px-3 py-3">{row.activityType}</td>
                    <td className="px-3 py-3">{row.hours.toFixed(2)} h</td>
                    <td className="px-3 py-3">{row.sessionsCount}</td>
                    <td className="px-3 py-3">
                      {(totalClassHours > 0 ? (row.hours / totalClassHours) * 100 : 0).toFixed(1)}%
                    </td>
                    <td className="px-3 py-3">
                      {(totalWorkHours > 0 ? (row.hours / totalWorkHours) * 100 : 0).toFixed(1)}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="kpi-card p-5">
        <h2 className="text-lg font-semibold">Horas asignadas por proyecto</h2>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          Horas estimadas de todas las tareas asignadas registradas en la plataforma, sin importar fecha, estado ni horas reales: {totalProjectHours.toFixed(2)} h
        </p>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--line)] bg-white">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--background)]/60 text-left">
                <th className="px-3 py-3 font-semibold">Proyecto</th>
                <th className="px-3 py-3 font-semibold">Academia - Especialidad</th>
                <th className="px-3 py-3 font-semibold">Horas</th>
                <th className="px-3 py-3 font-semibold">Tareas</th>
                <th className="px-3 py-3 font-semibold">Participacion</th>
              </tr>
            </thead>
            <tbody>
              {projectSummary.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-[var(--ink-muted)]">
                    No hay tareas asignadas con horas estimadas.
                  </td>
                </tr>
              ) : (
                projectSummary.map((row) => {
                  const pct = totalProjectHours > 0 ? (row.hours / totalProjectHours) * 100 : 0;
                  return (
                    <tr key={row.id} className="border-b border-[var(--line)]/50 align-top">
                      <td className="px-3 py-3">
                        <p className="font-semibold">{row.projectName}</p>
                        <p className="mt-1 font-mono text-xs text-[var(--ink-muted)]">{row.projectCode}</p>
                      </td>
                      <td className="px-3 py-3">{row.specialtyAcademy}</td>
                      <td className="px-3 py-3">{row.hours.toFixed(2)} h</td>
                      <td className="px-3 py-3">{row.tasks}</td>
                      <td className="px-3 py-3">{pct.toFixed(1)}%</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </article>

      <div className="grid gap-5 xl:grid-cols-[minmax(320px,380px),1fr]">
        <article className="kpi-card p-5">
          <h2 className="text-lg font-semibold">Distribución de tareas y proyectos</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Porcentaje de las horas de proyectos por academia y especialidad.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="h-40 w-40 rounded-full" style={teamDonutStyle} />
            <div className="space-y-2">
              {teamSpecialtyDistribution.length === 0 ? (
                <p className="text-sm text-[var(--ink-muted)]">Sin datos para graficar.</p>
              ) : (
                teamSpecialtyDistribution.map((row, index) => (
                  <div key={row.specialty} className="flex items-center gap-2 text-sm">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: chartPalette[index % chartPalette.length] }}
                    />
                    <span className="min-w-[120px]">{row.specialty}</span>
                    <span className="text-[var(--ink-muted)]">{row.pct.toFixed(1)}%</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </article>

        <article className="kpi-card p-5">
          <h2 className="text-lg font-semibold">Costo de tiempo por profesor</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Total combinado y porcentaje dedicado a tareas, proyectos y docencia.
          </p>

          {personStats.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--ink-muted)]">No hay carga asignada para mostrar en esta quincena.</p>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {personStats.map((person) => (
                <article key={person.id} className="rounded-2xl border border-[var(--line)] bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{person.fullName}</p>
                      <p className="text-xs text-[var(--ink-muted)]">
                        {person.totalHours.toFixed(2)} h totales · {person.tasksCount} tareas · {person.sessionsCount} clases
                      </p>
                      <p className="mt-1 text-xs text-[var(--ink-muted)]">
                        Tareas/proyectos {person.administrativeHours.toFixed(2)} h (
                        {(person.totalHours > 0 ? (person.administrativeHours / person.totalHours) * 100 : 0).toFixed(1)}%)
                        {" · "}Clase {person.teachingHours.toFixed(2)} h (
                        {(person.totalHours > 0 ? (person.teachingHours / person.totalHours) * 100 : 0).toFixed(1)}%)
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
                    <div className="flex h-full w-full">
                      {person.distribution.map((row, index) => (
                        <div
                          key={`${person.id}-${row.label}`}
                          style={{
                            width: `${row.pct}%`,
                            backgroundColor: chartPalette[index % chartPalette.length],
                          }}
                          title={`${row.label}: ${row.pct.toFixed(1)}%`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="mt-3 space-y-1 text-xs">
                    {person.distribution.map((row, index) => (
                      <div key={`${person.id}-${row.label}-legend`} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: chartPalette[index % chartPalette.length] }}
                          />
                          <span>{row.label}</span>
                        </div>
                        <span className="text-[var(--ink-muted)]">{row.hours.toFixed(2)} h ({row.pct.toFixed(1)}%)</span>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
