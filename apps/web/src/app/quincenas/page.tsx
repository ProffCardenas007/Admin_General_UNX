"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { useRouter } from "next/navigation";
import { API_URL, authHeaders, getStoredRole, getStoredToken } from "../../lib/api";
import { specialtyLabels, type LeadSpecialty } from "../../lib/specialties";
import { buildWorkDistribution, countsForReports, isTaskInPeriod, reportTaskHours, type WorkEntry } from "./reportLogic";

type TaskRow = {
  id: string;
  projectId: string;
  estimatedHours?: string;
  activeSeconds?: number | null;
  timerStartedAt?: string | null;
  dueDate?: string | null;
  createdAt?: string;
  approvalStatus?: "pending" | "approved" | "rejected" | null;
};

type ProjectRow = {
  id: string;
  code: string;
  name: string;
  scope?: LeadSpecialty | null;
};

type ClassHourBreakdown = {
  program: string;
  subject?: string;
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
  const monthIndex = Number(match[2]) - 1;

  if (monthIndex < 0 || monthIndex > 11) {
    return null;
  }

  const startDate = new Date(year, monthIndex, half === "first" ? 1 : 16);
  const endDate = half === "first"
    ? new Date(year, monthIndex, 15)
    : new Date(year, monthIndex + 1, 0);

  return {
    startKey: toDateKey(startDate),
    endKey: toDateKey(endDate),
  };
};

const fmtHours = (hours: number) => `${hours.toFixed(2)} h`;
const fmtPct = (pct: number) => `${pct.toFixed(1)}%`;

export default function QuincenasPage() {
  const router = useRouter();

  const now = new Date();
  const [yearMonth, setYearMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [halfMonth, setHalfMonth] = useState<HalfMonth>(now.getDate() <= 15 ? "first" : "second");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  // Momento de la carga: base para el tramo en curso de los cronómetros encendidos.
  const [loadedAtMs, setLoadedAtMs] = useState(0);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [classHours, setClassHours] = useState<ClassHoursRow[]>([]);
  const [classHoursLoading, setClassHoursLoading] = useState(false);

  const quincenaRange = useMemo(
    () => getQuincenaRange(yearMonth, halfMonth),
    [halfMonth, yearMonth],
  );

  const distribution = useMemo(() => {
    const projectsById = new Map(projects.map((project) => [project.id, project]));

    // Tareas: las que vencen dentro de la quincena (o, sin fecha de vencimiento, que se
    // registraron en ella), agrupadas por programa (especialidad del proyecto) y
    // materia (academia del proyecto). Horas: las del cronómetro si ya se usó; si no,
    // las estimadas. (El reporte por usuario sigue usando solo las estimadas.)
    const periodTasks = quincenaRange ? tasks.filter((task) => countsForReports(task) && isTaskInPeriod(task, quincenaRange)) : [];
    const taskHours = periodTasks.map((task) => reportTaskHours(task, loadedAtMs));
    const timerTasks = taskHours.filter((row) => row.source === "timer").length;
    const taskEntries: WorkEntry[] = periodTasks.map((task, index) => {
      const { hours } = taskHours[index];
      const project = projectsById.get(task.projectId);
      return {
        kind: "Tareas",
        program: project?.scope ? specialtyLabels[project.scope] : "Sin programa",
        subject: project?.code?.trim() || "Sin materia",
        hours,
        count: 1,
      };
    });

    // Clases: sesiones de la quincena, agrupadas por programa y materia.
    const classEntries: WorkEntry[] = classHours.flatMap((person) =>
      person.breakdown.map((row) => ({
        kind: "Clases" as const,
        program: row.program,
        subject: row.subject ?? "Sin materia",
        hours: row.hours,
        count: row.sessionsCount,
      })),
    );

    return {
      ...buildWorkDistribution([...classEntries, ...taskEntries]),
      timerTasks,
      estimateTasks: periodTasks.length - timerTasks,
    };
  }, [classHours, loadedAtMs, projects, quincenaRange, tasks]);

  const quincenaLabel = halfMonth === "first" ? "1 al 15" : "16 al fin de mes";

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

      doc.setFontSize(17);
      doc.text("Reporte de gerencia · Distribución de trabajo", marginX, cursorY);

      cursorY += 20;
      doc.setFontSize(10);
      doc.text(`Periodo: ${yearMonth} · Quincena: ${quincenaLabel}`, marginX, cursorY);
      cursorY += 14;
      doc.text(
        `Rango: ${quincenaRange ? `${quincenaRange.startKey} a ${quincenaRange.endKey}` : "no disponible"}`,
        marginX,
        cursorY,
      );
      cursorY += 14;
      doc.text(
        `Horas totales: ${fmtHours(distribution.totalHours)} · Clases: ${fmtHours(distribution.classHours)} (${fmtPct(
          distribution.totalHours > 0 ? (distribution.classHours / distribution.totalHours) * 100 : 0,
        )}) · Tareas: ${fmtHours(distribution.taskHours)} (${fmtPct(
          distribution.totalHours > 0 ? (distribution.taskHours / distribution.totalHours) * 100 : 0,
        )})`,
        marginX,
        cursorY,
      );

      autoTable(doc, {
        startY: cursorY + 16,
        head: [["Tipo", "Programa", "Materia", "Horas", "% del trabajo"]],
        body:
          distribution.rows.length === 0
            ? [["Sin datos", "-", "-", fmtHours(0), fmtPct(0)]]
            : distribution.rows.map((row) => [
                row.kind,
                row.program,
                row.subject,
                fmtHours(row.hours),
                fmtPct(row.pctOfTotal),
              ]),
        foot: [["Total", "", "", fmtHours(distribution.totalHours), distribution.totalHours > 0 ? "100.0%" : fmtPct(0)]],
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: [47, 111, 237] },
        footStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42] },
      });

      cursorY =
        ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
          ?.finalY ?? cursorY + 16) + 20;

      autoTable(doc, {
        startY: cursorY,
        head: [["Programa", "Materia", "Horas clases", "Horas tareas", "Horas totales", "% del trabajo"]],
        body:
          distribution.areas.length === 0
            ? [["Sin datos", "-", fmtHours(0), fmtHours(0), fmtHours(0), fmtPct(0)]]
            : distribution.areas.map((area) => [
                area.program,
                area.subject,
                fmtHours(area.classHours),
                fmtHours(area.taskHours),
                fmtHours(area.hours),
                fmtPct(area.pctOfTotal),
              ]),
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: [11, 79, 108] },
      });

      cursorY =
        ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
          ?.finalY ?? cursorY) + 18;
      doc.setFontSize(8);
      doc.text(
        `Clases: sesiones de la quincena (incluye coberturas). Tareas: las que vencen en la quincena; horas del cronometro si se uso (${distribution.timerTasks}), si no, estimadas (${distribution.estimateTasks}).`,
        marginX,
        cursorY,
      );

      const fileHalf = halfMonth === "first" ? "01-15" : "16-fin";
      doc.save(`reporte-gerencia-${yearMonth}-${fileHalf}.pdf`);
    } catch {
      setError("No se pudo generar el PDF del reporte.");
    }
  };

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
        const [tasksResponse, projectsResponse] = await Promise.all([
          axios.get(`${API_URL}/tasks`, { headers }),
          axios.get(`${API_URL}/projects`, { headers }),
        ]);

        setTasks(tasksResponse.data as TaskRow[]);
        setLoadedAtMs(Date.now());
        setProjects(projectsResponse.data as ProjectRow[]);
      } catch {
        setError("No se pudo cargar el reporte.");
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
          <h1 className="text-2xl font-semibold">Reporte de gerencia</h1>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">Cargando datos...</p>
        </article>
      </section>
    );
  }

  const { rows, areas, totalHours, classHours: totalClassHours, taskHours: totalTaskHours } = distribution;
  const classPct = totalHours > 0 ? (totalClassHours / totalHours) * 100 : 0;
  const taskPct = totalHours > 0 ? (totalTaskHours / totalHours) * 100 : 0;

  return (
    <section className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
      <article className="kpi-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Reporte de gerencia</h1>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Distribución del trabajo por programa y materia, para repartir los gastos de la quincena.
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <button type="button" onClick={onGeneratePdf} className="ui-btn ui-btn-primary ui-btn-sm">
              Generar PDF
            </button>
            <Link href="/dashboard" className="ui-btn ui-btn-secondary ui-btn-sm">Volver al dashboard</Link>
          </div>
        </div>

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
                ? `Rango: ${quincenaRange.startKey} al ${quincenaRange.endKey} (clases y tareas)`
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

      <div className="grid gap-3 sm:grid-cols-3">
        <article className="kpi-card p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Horas totales</p>
          <p className="mt-2 text-3xl font-semibold">{fmtHours(totalHours)}</p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">Base del 100% para repartir gastos</p>
        </article>
        <article className="kpi-card p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Clases</p>
          <p className="mt-2 text-3xl font-semibold">
            {classHoursLoading ? "…" : fmtHours(totalClassHours)}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">{fmtPct(classPct)} del trabajo</p>
        </article>
        <article className="kpi-card p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">Tareas</p>
          <p className="mt-2 text-3xl font-semibold">{fmtHours(totalTaskHours)}</p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            {fmtPct(taskPct)} del trabajo · {distribution.timerTasks} con cronómetro, {distribution.estimateTasks} estimadas
          </p>
        </article>
      </div>

      <article className="kpi-card p-5">
        <h2 className="text-lg font-semibold">Distribución de trabajo</h2>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          Horas y porcentaje del trabajo total por tipo, programa y materia.
        </p>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--line)] bg-white">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--background)]/60 text-left">
                <th className="px-3 py-3 font-semibold">Tipo</th>
                <th className="px-3 py-3 font-semibold">Programa</th>
                <th className="px-3 py-3 font-semibold">Materia</th>
                <th className="px-3 py-3 text-right font-semibold">Horas</th>
                <th className="px-3 py-3 text-right font-semibold">% del trabajo</th>
                <th className="hidden px-3 py-3 font-semibold md:table-cell">
                  <span className="sr-only">Proporción</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-[var(--ink-muted)]">
                    {classHoursLoading ? "Cargando horas de clase…" : "No hay clases ni tareas para mostrar."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={`${row.kind}-${row.program}-${row.subject}`}
                    className="border-b border-[var(--line)]/50"
                  >
                    <td className="px-3 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                          row.kind === "Clases"
                            ? "bg-sky-100 text-sky-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {row.kind}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-semibold">{row.program}</td>
                    <td className="px-3 py-3">{row.subject}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmtHours(row.hours)}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{fmtPct(row.pctOfTotal)}</td>
                    <td className="hidden w-48 px-3 py-3 md:table-cell">
                      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full ${row.kind === "Clases" ? "bg-sky-500" : "bg-amber-500"}`}
                          style={{ width: `${Math.min(100, row.pctOfTotal)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 ? (
              <tfoot>
                <tr className="bg-[var(--background)]/60 font-semibold">
                  <td className="px-3 py-3" colSpan={3}>Total</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmtHours(totalHours)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">100.0%</td>
                  <td className="hidden md:table-cell" />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </article>

      <article className="kpi-card p-5">
        <h2 className="text-lg font-semibold">Resumen por programa y materia</h2>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          Clases y tareas sumadas por área: el porcentaje con el que se reparte el gasto de cada una.
        </p>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--line)] bg-white">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--background)]/60 text-left">
                <th className="px-3 py-3 font-semibold">Programa</th>
                <th className="px-3 py-3 font-semibold">Materia</th>
                <th className="px-3 py-3 text-right font-semibold">Horas clases</th>
                <th className="px-3 py-3 text-right font-semibold">Horas tareas</th>
                <th className="px-3 py-3 text-right font-semibold">Horas totales</th>
                <th className="px-3 py-3 text-right font-semibold">% del trabajo</th>
              </tr>
            </thead>
            <tbody>
              {areas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-[var(--ink-muted)]">
                    Sin datos.
                  </td>
                </tr>
              ) : (
                areas.map((area) => (
                  <tr key={`${area.program}-${area.subject}`} className="border-b border-[var(--line)]/50">
                    <td className="px-3 py-3 font-semibold">{area.program}</td>
                    <td className="px-3 py-3">{area.subject}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmtHours(area.classHours)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmtHours(area.taskHours)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmtHours(area.hours)}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{fmtPct(area.pctOfTotal)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-[var(--ink-muted)]">
          Clases: sesiones impartidas en la quincena, incluidas coberturas de profesor sustituto. Tareas: las que vencen
          dentro de la quincena (las que no tienen fecha de vencimiento cuentan por su fecha de registro), sin importar
          su estado. Si la tarea ya usó el cronómetro cuentan sus horas ({distribution.timerTasks} tareas); si no, cuentan
          las horas estimadas ({distribution.estimateTasks} tareas); el programa es la especialidad del proyecto y la materia es su academia.
        </p>
      </article>
    </section>
  );
}
