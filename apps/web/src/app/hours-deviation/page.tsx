"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL, authHeaders, getStoredRole, getStoredToken } from "../../lib/api";

type ActivityType =
  | "creacion"
  | "grabacion"
  | "presentaciones"
  | "edicion"
  | "revision"
  | "plataforma"
  | "administrativo";

type Summary = {
  tasks: number;
  estimatedHours: number;
  authorizedHours: number;
  realHours: number;
  varianceHours: number;
  variancePercent: number;
  overEstimateTasks: number;
  overAuthorizedTasks: number;
};

type UserRow = Summary & { userId: string; fullName: string };
type ActivityRow = Summary & { activityType: ActivityType };

type OverrunningTask = {
  taskId: string;
  code: string;
  title: string;
  activityType: ActivityType;
  assigneeName: string;
  estimatedHours: number;
  authorizedHours: number;
  realHours: number;
  overHours: number;
};

type DeviationReport = {
  period: { from: string | null; to: string | null };
  totals: Summary;
  untrackedTasks: number;
  byUser: UserRow[];
  byActivity: ActivityRow[];
  overrunningNow: OverrunningTask[];
};

type HalfMonth = "first" | "second";
type PeriodMode = "fortnight" | "global";

const activityLabels: Record<ActivityType, string> = {
  creacion: "Creación",
  grabacion: "Grabación",
  presentaciones: "Presentaciones",
  edicion: "Edición",
  revision: "Revisión",
  plataforma: "Plataforma",
  administrativo: "Administrativo",
};

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getFortnightRange = (yearMonth: string, half: HalfMonth) => {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) {
    return null;
  }
  const start = new Date(year, monthIndex, half === "first" ? 1 : 16);
  const end = half === "first" ? new Date(year, monthIndex, 15) : new Date(year, monthIndex + 1, 0);
  return { from: toDateKey(start), to: toDateKey(end) };
};

const formatNumber = (value: number, digits = 1) =>
  new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

const signed = (value: number, digits = 1) => `${value > 0 ? "+" : ""}${formatNumber(value, digits)}`;

const varianceClass = (value: number) =>
  value > 0.05 ? "text-[var(--danger)]" : value < -0.05 ? "text-emerald-700" : "text-[var(--ink-muted)]";

/** Real vs estimated bar; the marker shows where the estimate sits. */
function HoursBar({ estimated, real }: { estimated: number; real: number }) {
  const scale = Math.max(estimated, real, 1);
  return (
    <div className="relative h-2 w-full min-w-[96px] rounded-full bg-[var(--background)]" aria-hidden="true">
      <div
        className={`h-full rounded-full ${real > estimated ? "bg-[var(--danger)]" : "bg-[var(--accent)]"}`}
        style={{ width: `${Math.min((real / scale) * 100, 100)}%` }}
      />
      <div
        className="absolute top-[-3px] h-[14px] w-[2px] bg-[var(--foreground)]"
        style={{ left: `${Math.min((estimated / scale) * 100, 100)}%` }}
      />
    </div>
  );
}

function SummaryTable({
  rows,
  firstColumn,
}: {
  rows: Array<Summary & { key: string; label: string }>;
  firstColumn: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--line)] text-xs uppercase tracking-[0.1em] text-[var(--ink-muted)]">
            <th className="px-5 py-3 font-semibold">{firstColumn}</th>
            <th className="px-3 py-3 text-right font-semibold">Tareas</th>
            <th className="px-3 py-3 text-right font-semibold">Estimadas</th>
            <th className="px-3 py-3 text-right font-semibold">Autorizadas</th>
            <th className="px-3 py-3 text-right font-semibold">Reales</th>
            <th className="px-3 py-3 font-semibold">Real vs. estimado</th>
            <th className="px-3 py-3 text-right font-semibold">Desviación</th>
            <th className="px-5 py-3 text-right font-semibold">Pasaron lo autorizado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-[var(--line)]/60 last:border-b-0">
              <td className="px-5 py-3 font-semibold">{row.label}</td>
              <td className="px-3 py-3 text-right">{row.tasks}</td>
              <td className="px-3 py-3 text-right">{formatNumber(row.estimatedHours)} h</td>
              <td className="px-3 py-3 text-right">{formatNumber(row.authorizedHours)} h</td>
              <td className="px-3 py-3 text-right">{formatNumber(row.realHours)} h</td>
              <td className="px-3 py-3">
                <HoursBar estimated={row.estimatedHours} real={row.realHours} />
              </td>
              <td className={`px-3 py-3 text-right font-semibold ${varianceClass(row.varianceHours)}`}>
                {signed(row.varianceHours)} h
                <span className="ml-1 text-xs font-normal">({signed(row.variancePercent, 0)}%)</span>
              </td>
              <td className="px-5 py-3 text-right">
                {row.overAuthorizedTasks} de {row.tasks}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function HoursDeviationPage() {
  const router = useRouter();
  const now = new Date();
  const [mode, setMode] = useState<PeriodMode>("fortnight");
  const [yearMonth, setYearMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  const [half, setHalf] = useState<HalfMonth>(now.getDate() <= 15 ? "first" : "second");
  const [report, setReport] = useState<DeviationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const range = useMemo(() => getFortnightRange(yearMonth, half), [yearMonth, half]);

  useEffect(() => {
    if (!getStoredToken()) {
      router.replace("/");
      return;
    }
    if (getStoredRole() !== "manager") {
      router.replace("/dashboard");
    }
  }, [router]);

  useEffect(() => {
    if (getStoredRole() !== "manager") {
      return;
    }

    let cancelled = false;
    const loadReport = async () => {
      setLoading(true);
      setError("");
      try {
        const params = mode === "fortnight" && range ? { from: range.from, to: range.to } : undefined;
        const response = await axios.get<DeviationReport>(`${API_URL}/reports/hours-deviation`, {
          headers: authHeaders(),
          params,
        });
        if (!cancelled) {
          setReport(response.data);
        }
      } catch (caughtError) {
        if (!cancelled) {
          const message = axios.isAxiosError(caughtError) ? caughtError.response?.data?.message : "";
          setError(typeof message === "string" ? message : "No se pudo cargar el reporte de desviación.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadReport();
    return () => {
      cancelled = true;
    };
  }, [mode, range]);

  const totals = report?.totals;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <section className="glass-panel fade-up p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">
              Análisis gerencial
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Desviación de horas</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--ink-muted)] md:text-base">
              Qué tanto se parece lo estimado a lo que realmente toma cada tarea, por persona y por tipo de
              actividad. Sirve para calibrar estimaciones y decidir cuándo autorizar más horas.
            </p>
          </div>
          <Link href="/dashboard" className="ui-btn ui-btn-secondary">
            Volver al panel
          </Link>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-[auto,minmax(180px,240px),auto] lg:items-end">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Periodo</p>
            <div className="inline-flex rounded-xl border border-[var(--line)] bg-white p-1">
              <button
                type="button"
                aria-pressed={mode === "fortnight"}
                onClick={() => setMode("fortnight")}
                className={`ui-btn ui-btn-sm ${mode === "fortnight" ? "ui-btn-primary" : "ui-btn-secondary"}`}
              >
                Quincenal
              </button>
              <button
                type="button"
                aria-pressed={mode === "global"}
                onClick={() => setMode("global")}
                className={`ui-btn ui-btn-sm ${mode === "global" ? "ui-btn-primary" : "ui-btn-secondary"}`}
              >
                Global
              </button>
            </div>
          </div>
          {mode === "fortnight" ? (
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              Mes
              <input
                type="month"
                value={yearMonth}
                onChange={(event) => setYearMonth(event.target.value)}
                className="ui-control mt-2"
              />
            </label>
          ) : (
            <div />
          )}
          {mode === "fortnight" ? (
            <div className="inline-flex rounded-xl border border-[var(--line)] bg-white p-1">
              <button
                type="button"
                aria-pressed={half === "first"}
                onClick={() => setHalf("first")}
                className={`ui-btn ui-btn-sm ${half === "first" ? "ui-btn-primary" : "ui-btn-secondary"}`}
              >
                1 al 15
              </button>
              <button
                type="button"
                aria-pressed={half === "second"}
                onClick={() => setHalf("second")}
                className={`ui-btn ui-btn-sm ${half === "second" ? "ui-btn-primary" : "ui-btn-secondary"}`}
              >
                16 al cierre
              </button>
            </div>
          ) : null}
        </div>

        <p className="mt-3 text-xs text-[var(--ink-muted)]">
          {mode === "global"
            ? "Todas las tareas terminadas."
            : range
              ? `Tareas terminadas del ${range.from} al ${range.to}.`
              : "Selecciona un mes válido."}{" "}
          Solo se miden tareas terminadas con estimado y con tiempo registrado.
        </p>
      </section>

      {error ? (
        <p className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      {loading ? (
        <section className="kpi-card p-5">
          <div className="ui-skeleton h-7 w-56" />
          <div className="ui-skeleton mt-4 h-28 w-full" />
        </section>
      ) : report && totals ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Horas estimadas",
                value: `${formatNumber(totals.estimatedHours)} h`,
                note: `${totals.tasks} tarea(s) medidas`,
              },
              {
                label: "Horas autorizadas",
                value: `${formatNumber(totals.authorizedHours)} h`,
                note: `${formatNumber(totals.authorizedHours - totals.estimatedHours)} h extra aprobadas`,
              },
              {
                label: "Horas reales",
                value: `${formatNumber(totals.realHours)} h`,
                note: "cronómetro + captura manual",
              },
              {
                label: "Desviación total",
                value: `${signed(totals.varianceHours)} h`,
                note: `${signed(totals.variancePercent, 0)}% vs. estimado · ${totals.overAuthorizedTasks} tarea(s) pasaron lo autorizado`,
                tone: varianceClass(totals.varianceHours),
              },
            ].map((metric) => (
              <article key={metric.label} className="kpi-card fade-up p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                  {metric.label}
                </p>
                <p className={`mt-2 text-2xl font-semibold ${metric.tone ?? ""}`}>{metric.value}</p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">{metric.note}</p>
              </article>
            ))}
          </section>

          {report.untrackedTasks > 0 ? (
            <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {report.untrackedTasks} tarea(s) terminadas no tienen tiempo registrado y no se incluyen en estos
              promedios. Para medirlas, la persona debe usar el cronómetro o capturar sus horas.
            </p>
          ) : null}

          <section className="kpi-card fade-up overflow-hidden p-0">
            <div className="border-b border-[var(--line)] px-5 py-4">
              <h2 className="text-lg font-semibold">Tareas abiertas que ya pasaron lo autorizado</h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                No dependen del periodo. Son candidatas a pedir o autorizar horas adicionales.
              </p>
            </div>
            {report.overrunningNow.length === 0 ? (
              <p className="ui-empty m-4 px-4 py-3 text-sm">Ninguna tarea abierta excede su tiempo autorizado.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--line)] text-xs uppercase tracking-[0.1em] text-[var(--ink-muted)]">
                      <th className="px-5 py-3 font-semibold">Tarea</th>
                      <th className="px-3 py-3 font-semibold">Responsable</th>
                      <th className="px-3 py-3 font-semibold">Actividad</th>
                      <th className="px-3 py-3 text-right font-semibold">Autorizadas</th>
                      <th className="px-3 py-3 text-right font-semibold">Reales</th>
                      <th className="px-5 py-3 text-right font-semibold">Excedente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.overrunningNow.map((task) => (
                      <tr key={task.taskId} className="border-b border-[var(--line)]/60 last:border-b-0">
                        <td className="px-5 py-3">
                          <p className="font-semibold">{task.title}</p>
                          <p className="text-xs text-[var(--ink-muted)]">{task.code}</p>
                        </td>
                        <td className="px-3 py-3">{task.assigneeName}</td>
                        <td className="px-3 py-3">{activityLabels[task.activityType]}</td>
                        <td className="px-3 py-3 text-right">{formatNumber(task.authorizedHours)} h</td>
                        <td className="px-3 py-3 text-right">{formatNumber(task.realHours)} h</td>
                        <td className="px-5 py-3 text-right font-semibold text-[var(--danger)]">
                          +{formatNumber(task.overHours)} h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="kpi-card fade-up overflow-hidden p-0">
            <div className="border-b border-[var(--line)] px-5 py-4">
              <h2 className="text-lg font-semibold">Por persona</h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                Ordenado de mayor a menor desviación. La marca en la barra es el estimado.
              </p>
            </div>
            {report.byUser.length === 0 ? (
              <p className="ui-empty m-4 px-4 py-3 text-sm">Sin tareas terminadas con tiempo registrado en este periodo.</p>
            ) : (
              <SummaryTable
                firstColumn="Persona"
                rows={report.byUser.map((row) => ({ ...row, key: row.userId, label: row.fullName }))}
              />
            )}
          </section>

          <section className="kpi-card fade-up overflow-hidden p-0">
            <div className="border-b border-[var(--line)] px-5 py-4">
              <h2 className="text-lg font-semibold">Por tipo de actividad</h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                Si un tipo siempre se pasa, el problema es el estimado estándar, no la persona.
              </p>
            </div>
            {report.byActivity.length === 0 ? (
              <p className="ui-empty m-4 px-4 py-3 text-sm">Sin datos para este periodo.</p>
            ) : (
              <SummaryTable
                firstColumn="Actividad"
                rows={report.byActivity.map((row) => ({
                  ...row,
                  key: row.activityType,
                  label: activityLabels[row.activityType],
                }))}
              />
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
