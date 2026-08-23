"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL, authHeaders, getStoredEmail, getStoredRole, getStoredToken } from "../../lib/api";

type ActivityType =
  | "creacion"
  | "grabacion"
  | "presentaciones"
  | "edicion"
  | "revision"
  | "plataforma"
  | "administrativo";

type ActivityMetric = {
  weight: number;
  tasks: number;
  completed: number;
  hours: number;
  points: number;
};

type UserPerformance = {
  userId: string;
  fullName: string;
  email: string;
  role: "lead" | "worker";
  rank: number;
  tasks: number;
  openTasks: number;
  completedTasks: number;
  notCompletedTasks: number;
  completionRate: number;
  estimatedHours: number;
  workedHours: number;
  points: number;
  activity: Record<ActivityType, ActivityMetric>;
};

type PerformanceReport = {
  period: { from: string | null; to: string | null };
  weights: Record<ActivityType, number>;
  team: {
    users: number;
    averageHours: number;
    averagePoints: number;
    totalCompletedTasks: number;
  };
  users: UserPerformance[];
};

type HalfMonth = "first" | "second";
type PeriodMode = "fortnight" | "global";

const activityOrder: ActivityType[] = [
  "creacion",
  "grabacion",
  "presentaciones",
  "edicion",
  "revision",
  "plataforma",
  "administrativo",
];

const activityLabels: Record<ActivityType, string> = {
  creacion: "Creación",
  grabacion: "Grabación",
  presentaciones: "Presentaciones",
  edicion: "Edición",
  revision: "Revisión",
  plataforma: "Plataforma",
  administrativo: "Administrativo",
};

const roleLabels = {
  lead: "Líder",
  worker: "Colaborador",
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
  const end = half === "first"
    ? new Date(year, monthIndex, 15)
    : new Date(year, monthIndex + 1, 0);
  return { from: toDateKey(start), to: toDateKey(end) };
};

const formatNumber = (value: number, digits = 1) =>
  new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

const comparisonLabel = (value: number, average: number) => {
  if (average === 0) {
    return value === 0 ? "En promedio" : "Sin promedio previo";
  }
  const difference = ((value - average) / average) * 100;
  if (Math.abs(difference) < 0.5) {
    return "En promedio";
  }
  return `${difference > 0 ? "+" : ""}${formatNumber(difference, 0)}% vs. promedio`;
};

export default function UserReportsPage() {
  const router = useRouter();
  const now = new Date();
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<PeriodMode>("fortnight");
  const [yearMonth, setYearMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  const [half, setHalf] = useState<HalfMonth>(now.getDate() <= 15 ? "first" : "second");
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const range = useMemo(() => getFortnightRange(yearMonth, half), [yearMonth, half]);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.replace("/");
      return;
    }
    if (getStoredRole() !== "manager") {
      router.replace("/dashboard");
      return;
    }
    setEmail(getStoredEmail());
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
        const params = mode === "fortnight" && range
          ? { from: range.from, to: range.to }
          : undefined;
        const response = await axios.get<PerformanceReport>(
          `${API_URL}/reports/users/performance`,
          { headers: authHeaders(), params },
        );
        if (cancelled) {
          return;
        }
        setReport(response.data);
        setSelectedUserId((current) =>
          response.data.users.some((user) => user.userId === current)
            ? current
            : response.data.users[0]?.userId ?? "",
        );
      } catch (caughtError) {
        if (!cancelled) {
          const message = axios.isAxiosError(caughtError)
            ? caughtError.response?.data?.message
            : "";
          setError(typeof message === "string" ? message : "No se pudo cargar el reporte por usuario.");
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

  const selectedUser = report?.users.find((user) => user.userId === selectedUserId);
  const teamCompletionAverage = report && report.users.length > 0
    ? report.users.reduce((sum, user) => sum + user.completionRate, 0) / report.users.length
    : 0;
  const teamTotalHours = report?.users.reduce((sum, user) => sum + user.workedHours, 0) ?? 0;
  const teamTotalPoints = report?.users.reduce((sum, user) => sum + user.points, 0) ?? 0;
  const maxActivityPoints = selectedUser
    ? Math.max(...activityOrder.map((activity) => selectedUser.activity[activity].points), 1)
    : 1;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <section className="glass-panel fade-up p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">
              Análisis gerencial
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              Reporte por Usuario
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--ink-muted)] md:text-base">
              {email ? `Sesión activa como ${email}. ` : ""}Desempeño comparativo por tareas, horas y actividad.
            </p>
          </div>
          <Link href="/dashboard" className="ui-btn ui-btn-secondary">
            Volver al panel
          </Link>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-[auto,minmax(180px,240px),auto] lg:items-end">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              Periodo
            </p>
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
          ) : <div />}
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
            ? "Acumulado histórico completo."
            : range
              ? `Periodo analizado: ${range.from} al ${range.to}.`
              : "Selecciona un mes válido."}
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
      ) : report ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Equipo evaluado", value: report.team.users.toString(), note: "líderes y colaboradores activos" },
              { label: "Horas reales", value: `${formatNumber(teamTotalHours)} h`, note: `${formatNumber(report.team.averageHours)} h promedio` },
              { label: "Puntos ponderados", value: formatNumber(teamTotalPoints), note: `${formatNumber(report.team.averagePoints)} promedio` },
              { label: "Tareas completadas", value: report.team.totalCompletedTasks.toString(), note: `${formatNumber(teamCompletionAverage)}% cierre promedio` },
            ].map((metric) => (
              <article key={metric.label} className="kpi-card fade-up p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">{metric.label}</p>
                <p className="mt-2 text-2xl font-semibold">{metric.value}</p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">{metric.note}</p>
              </article>
            ))}
          </section>

          <section className="kpi-card fade-up overflow-hidden p-0">
            <div className="border-b border-[var(--line)] px-5 py-4">
              <h2 className="text-lg font-semibold">Comparativo del equipo</h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                Ranking por puntos ponderados; selecciona una fila para abrir el detalle.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="ui-table min-w-[820px] w-full">
                <thead>
                  <tr className="border-b border-[var(--line)] bg-[var(--background)]/70 text-left">
                    <th className="px-4 py-3 font-semibold">Posición</th>
                    <th className="px-4 py-3 font-semibold">Usuario</th>
                    <th className="px-4 py-3 font-semibold">Tareas</th>
                    <th className="px-4 py-3 font-semibold">Completadas</th>
                    <th className="px-4 py-3 font-semibold">No completadas</th>
                    <th className="px-4 py-3 font-semibold">Horas</th>
                    <th className="px-4 py-3 font-semibold">Puntos</th>
                    <th className="px-4 py-3 font-semibold">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {report.users.map((user) => (
                    <tr
                      key={user.userId}
                      className={`border-b border-[var(--line)]/60 ${selectedUserId === user.userId ? "bg-[var(--accent)]/5" : ""}`}
                    >
                      <td className="px-4 py-3 font-mono font-semibold">#{user.rank}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold">{user.fullName}</p>
                        <p className="text-xs text-[var(--ink-muted)]">{roleLabels[user.role]} · {user.email}</p>
                      </td>
                      <td className="px-4 py-3">{user.tasks}</td>
                      <td className="px-4 py-3 text-emerald-700">{user.completedTasks}</td>
                      <td className="px-4 py-3 text-[var(--danger)]">{user.notCompletedTasks}</td>
                      <td className="px-4 py-3">{formatNumber(user.workedHours)} h</td>
                      <td className="px-4 py-3 font-semibold text-[var(--accent)]">{formatNumber(user.points)}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setSelectedUserId(user.userId)}
                          className="ui-btn ui-btn-secondary ui-btn-sm"
                        >
                          Ver análisis
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.users.length === 0 ? (
                <p className="ui-empty m-4 px-4 py-3 text-sm">No hay trabajadores activos para comparar.</p>
              ) : null}
            </div>
          </section>

          {selectedUser ? (
            <section className="kpi-card fade-up p-5 md:p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
                    Posición #{selectedUser.rank}
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold">{selectedUser.fullName}</h2>
                  <p className="text-sm text-[var(--ink-muted)]">{selectedUser.email}</p>
                </div>
                <select
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                  className="ui-control md:max-w-sm"
                >
                  {report.users.map((user) => (
                    <option key={user.userId} value={user.userId}>{user.fullName}</option>
                  ))}
                </select>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                {[
                  { label: "Tareas", value: selectedUser.tasks.toString(), tone: "" },
                  { label: "Abiertas", value: selectedUser.openTasks.toString(), tone: "text-[var(--accent)]" },
                  { label: "Completadas", value: selectedUser.completedTasks.toString(), tone: "text-emerald-700" },
                  { label: "No completadas", value: selectedUser.notCompletedTasks.toString(), tone: "text-[var(--danger)]" },
                  { label: "Horas reales", value: `${formatNumber(selectedUser.workedHours)} h`, tone: "" },
                  { label: "Puntos", value: formatNumber(selectedUser.points), tone: "text-[var(--accent)]" },
                ].map((metric) => (
                  <div key={metric.label} className="rounded-lg border border-[var(--line)] bg-white p-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">{metric.label}</p>
                    <p className={`mt-2 text-xl font-semibold ${metric.tone}`}>{metric.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 grid gap-5 lg:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold">Comparación con el equipo</h3>
                  <div className="mt-3 space-y-4">
                    {[
                      {
                        label: "Puntos ponderados",
                        value: selectedUser.points,
                        average: report.team.averagePoints,
                        suffix: " pts",
                      },
                      {
                        label: "Horas reales",
                        value: selectedUser.workedHours,
                        average: report.team.averageHours,
                        suffix: " h",
                      },
                      {
                        label: "Tasa de cierre",
                        value: selectedUser.completionRate,
                        average: teamCompletionAverage,
                        suffix: "%",
                      },
                    ].map((comparison) => {
                      const scale = Math.max(comparison.value, comparison.average, 1);
                      return (
                        <div key={comparison.label}>
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <p className="font-semibold">{comparison.label}</p>
                            <p className="text-xs text-[var(--ink-muted)]">
                              {comparisonLabel(comparison.value, comparison.average)}
                            </p>
                          </div>
                          <div className="mt-2 grid gap-2">
                            <div className="grid grid-cols-[72px,1fr,70px] items-center gap-2 text-xs">
                              <span>Usuario</span>
                              <div className="bar-track"><div className="bar-fill" style={{ width: `${(comparison.value / scale) * 100}%` }} /></div>
                              <span className="text-right font-semibold">{formatNumber(comparison.value)}{comparison.suffix}</span>
                            </div>
                            <div className="grid grid-cols-[72px,1fr,70px] items-center gap-2 text-xs text-[var(--ink-muted)]">
                              <span>Promedio</span>
                              <div className="bar-track"><div className="h-full rounded-full bg-slate-400" style={{ width: `${(comparison.average / scale) * 100}%` }} /></div>
                              <span className="text-right">{formatNumber(comparison.average)}{comparison.suffix}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold">Desglose por actividad</h3>
                  <div className="mt-3 space-y-3">
                    {activityOrder.map((activityType) => {
                      const metric = selectedUser.activity[activityType];
                      return (
                        <div key={activityType}>
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <p className="font-semibold">{activityLabels[activityType]}</p>
                            <p className="text-[var(--ink-muted)]">
                              {formatNumber(metric.hours)} h × {metric.weight} = <strong className="text-[var(--foreground)]">{formatNumber(metric.points)} pts</strong>
                            </p>
                          </div>
                          <div className="bar-track mt-1.5">
                            <div className="bar-fill" style={{ width: `${(metric.points / maxActivityPoints) * 100}%` }} />
                          </div>
                          <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
                            {metric.tasks} tarea(s) · {metric.completed} completada(s)
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <section className="kpi-card fade-up p-5">
            <h2 className="text-lg font-semibold">Valoración por actividad</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {activityOrder.map((activityType) => (
                <div key={activityType} className="rounded-lg border border-[var(--line)] bg-white p-3">
                  <p className="text-xs text-[var(--ink-muted)]">{activityLabels[activityType]}</p>
                  <p className="mt-1 text-lg font-semibold">{report.weights[activityType]} pts/h</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-[var(--ink-muted)]">
              Los puntos representan volumen ponderado según las horas registradas. La tasa de cierre y las tareas no completadas se muestran por separado para evaluar cumplimiento.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}