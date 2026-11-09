"use client";

import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { API_URL, authHeaders } from "../../lib/api";

type ActivityType =
  | "creacion"
  | "grabacion"
  | "presentaciones"
  | "edicion"
  | "revision"
  | "plataforma"
  | "administrativo";

type DeliveryStatus = "on_time" | "late" | "not_delivered" | "pending" | "delivered";

type SemesterTask = {
  id: string;
  code: string;
  title: string;
  projectName: string;
  activityType: ActivityType;
  status: string;
  deliveryStatus: DeliveryStatus;
  dueDate: string | null;
  completedAt: string | null;
  estimatedHours: number;
  weight: number;
  possiblePoints: number;
  grade: number | null;
  earnedPoints: number | null;
};

type SemesterUser = {
  userId: string;
  fullName: string;
  email: string;
  rank: number;
  tasks: SemesterTask[];
  taskCount: number;
  gradedCount: number;
  completedCount: number;
  onTimeCount: number;
  lateCount: number;
  notDeliveredCount: number;
  pendingCount: number;
  estimatedHours: number;
  possiblePoints: number;
  earnedPoints: number;
  finalGrade: number | null;
};

type SemesterReport = {
  year: number;
  semester: number;
  period: { from: string; to: string };
  weights: Record<ActivityType, number>;
  customizedWeights: boolean;
  team: {
    users: number;
    tasks: number;
    gradedTasks: number;
    averageGrade: number | null;
  };
  users: SemesterUser[];
};

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

const deliveryLabels: Record<DeliveryStatus, string> = {
  on_time: "Entregada a tiempo",
  late: "Entrega tardía",
  not_delivered: "No entregada",
  pending: "Pendiente",
  delivered: "Entregada",
};

const deliveryTone: Record<DeliveryStatus, string> = {
  on_time: "text-emerald-700",
  late: "text-amber-700",
  not_delivered: "text-[var(--danger)]",
  pending: "text-[var(--ink-muted)]",
  delivered: "text-emerald-700",
};

const formatNumber = (value: number, digits = 1) =>
  new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

const getErrorMessage = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError(error)) return fallback;
  const message = error.response?.data?.message;
  return typeof message === "string"
    ? message
    : Array.isArray(message)
      ? message.join(". ")
      : fallback;
};

export default function SemesterEvaluationPanel() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [semester, setSemester] = useState<1 | 2>(now.getMonth() < 6 ? 1 : 2);
  const [report, setReport] = useState<SemesterReport | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [weightDrafts, setWeightDrafts] = useState<Record<ActivityType, string>>(
    Object.fromEntries(activityOrder.map((activity) => [activity, "0"])) as Record<ActivityType, string>,
  );
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingWeights, setSavingWeights] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadReport = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await axios.get<SemesterReport>(
        `${API_URL}/reports/users/semester-evaluation`,
        { headers: authHeaders(), params: { year, semester } },
      );
      setReport(response.data);
      setWeightDrafts(
        Object.fromEntries(
          activityOrder.map((activity) => [activity, String(response.data.weights[activity])]),
        ) as Record<ActivityType, string>,
      );
      setGradeDrafts(
        Object.fromEntries(
          response.data.users.flatMap((user) =>
            user.tasks.map((task) => [task.id, task.grade === null ? "" : String(task.grade)]),
          ),
        ),
      );
      setSelectedUserId((current) =>
        response.data.users.some((user) => user.userId === current)
          ? current
          : response.data.users[0]?.userId ?? "",
      );
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "No se pudo cargar la evaluación semestral."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, semester]);

  const selectedUser = useMemo(
    () => report?.users.find((user) => user.userId === selectedUserId) ?? null,
    [report, selectedUserId],
  );

  const saveWeights = async () => {
    const weights = Object.fromEntries(
      activityOrder.map((activity) => [activity, Number(weightDrafts[activity])]),
    ) as Record<ActivityType, number>;
    if (activityOrder.some((activity) => !Number.isFinite(weights[activity]) || weights[activity] < 0 || weights[activity] > 100)) {
      setError("Cada ponderación debe ser un número entre 0 y 100.");
      return;
    }
    setSavingWeights(true);
    setError("");
    setNotice("");
    try {
      await axios.put(
        `${API_URL}/reports/users/semester-evaluation/weights`,
        { year, semester, weights },
        { headers: authHeaders() },
      );
      setNotice("Ponderaciones guardadas para este semestre.");
      await loadReport();
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "No se pudieron guardar las ponderaciones."));
    } finally {
      setSavingWeights(false);
    }
  };

  const saveGrade = async (taskId: string) => {
    const grade = Number(gradeDrafts[taskId]);
    if (!Number.isFinite(grade) || grade < 0 || grade > 100) {
      setError("La calificación debe estar entre 0 y 100.");
      return;
    }
    setSavingTaskId(taskId);
    setError("");
    setNotice("");
    try {
      await axios.put(
        `${API_URL}/reports/tasks/${taskId}/evaluation`,
        { grade },
        { headers: authHeaders() },
      );
      setNotice("Calificación guardada.");
      await loadReport();
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "No se pudo guardar la calificación."));
    } finally {
      setSavingTaskId("");
    }
  };

  return (
    <div className="space-y-6">
      <section className="kpi-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Evaluación semestral</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Califica cada tarea de 0 a 100 y conserva una ponderación diferente por semestre.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              Año
              <input
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
                className="ui-control mt-2"
              />
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              Semestre
              <select
                value={semester}
                onChange={(event) => setSemester(Number(event.target.value) as 1 | 2)}
                className="ui-control mt-2"
              >
                <option value={1}>Enero a junio</option>
                <option value={2}>Julio a diciembre</option>
              </select>
            </label>
          </div>
        </div>
        {report ? (
          <p className="mt-3 text-xs text-[var(--ink-muted)]">
            Periodo: {report.period.from} al {report.period.to}. Las tareas se asignan al semestre por su fecha límite.
          </p>
        ) : null}
      </section>

      {error ? (
        <p className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">{error}</p>
      ) : null}
      {notice ? (
        <p className="rounded-xl border border-emerald-600/30 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>
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
              { label: "Personas evaluadas", value: String(report.team.users), note: "con tareas en el semestre" },
              { label: "Tareas", value: String(report.team.tasks), note: "con vencimiento en el periodo" },
              { label: "Tareas calificadas", value: String(report.team.gradedTasks), note: `${report.team.tasks - report.team.gradedTasks} pendientes` },
              { label: "Promedio global", value: report.team.averageGrade === null ? "Pendiente" : formatNumber(report.team.averageGrade), note: "promedio de resultados individuales" },
            ].map((metric) => (
              <article key={metric.label} className="kpi-card p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">{metric.label}</p>
                <p className="mt-2 text-2xl font-semibold">{metric.value}</p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">{metric.note}</p>
              </article>
            ))}
          </section>

          <section className="kpi-card p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Ponderación de actividades</h2>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  Cada valor multiplica las horas estimadas de la tarea. Los cambios solo aplican a {year}, semestre {semester}.
                </p>
              </div>
              <button type="button" onClick={() => void saveWeights()} disabled={savingWeights} className="ui-btn ui-btn-primary">
                {savingWeights ? "Guardando..." : "Guardar ponderaciones"}
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {activityOrder.map((activity) => (
                <label key={activity} className="rounded-lg border border-[var(--line)] bg-white p-3 text-xs text-[var(--ink-muted)]">
                  {activityLabels[activity]}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={weightDrafts[activity]}
                    onChange={(event) => setWeightDrafts((current) => ({ ...current, [activity]: event.target.value }))}
                    className="ui-control mt-2"
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="kpi-card overflow-hidden p-0">
            <div className="border-b border-[var(--line)] px-5 py-4">
              <h2 className="text-lg font-semibold">Resultados del equipo</h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                El resultado usa únicamente tareas calificadas; las pendientes se muestran por separado.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="ui-table min-w-[900px] w-full">
                <thead>
                  <tr className="border-b border-[var(--line)] bg-[var(--background)]/70 text-left">
                    <th className="px-4 py-3">Posición</th>
                    <th className="px-4 py-3">Usuario</th>
                    <th className="px-4 py-3">Calificadas</th>
                    <th className="px-4 py-3">A tiempo</th>
                    <th className="px-4 py-3">Tardías</th>
                    <th className="px-4 py-3">No entregadas</th>
                    <th className="px-4 py-3">Resultado</th>
                    <th className="px-4 py-3">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {report.users.map((user) => (
                    <tr key={user.userId} className={`border-b border-[var(--line)]/60 ${selectedUserId === user.userId ? "bg-[var(--accent)]/5" : ""}`}>
                      <td className="px-4 py-3 font-mono font-semibold">#{user.rank}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold">{user.fullName}</p>
                        <p className="text-xs text-[var(--ink-muted)]">{user.email}</p>
                      </td>
                      <td className="px-4 py-3">{user.gradedCount}/{user.taskCount}</td>
                      <td className="px-4 py-3 text-emerald-700">{user.onTimeCount}</td>
                      <td className="px-4 py-3 text-amber-700">{user.lateCount}</td>
                      <td className="px-4 py-3 text-[var(--danger)]">{user.notDeliveredCount}</td>
                      <td className="px-4 py-3 font-semibold text-[var(--accent)]">
                        {user.finalGrade === null ? "Pendiente" : `${formatNumber(user.finalGrade)} / 100`}
                      </td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => setSelectedUserId(user.userId)} className="ui-btn ui-btn-secondary ui-btn-sm">
                          Ver tareas
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.users.length === 0 ? (
                <p className="ui-empty m-4 px-4 py-3 text-sm">No hay tareas con fecha límite en este semestre.</p>
              ) : null}
            </div>
          </section>

          {selectedUser ? (
            <section className="kpi-card overflow-hidden p-0">
              <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">Evaluación individual</p>
                  <h2 className="mt-1 text-xl font-semibold">{selectedUser.fullName}</h2>
                  <p className="text-sm text-[var(--ink-muted)]">
                    {selectedUser.gradedCount} de {selectedUser.taskCount} tareas calificadas · {formatNumber(selectedUser.estimatedHours)} h estimadas
                  </p>
                </div>
                <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className="ui-control md:max-w-sm">
                  {report.users.map((user) => (
                    <option key={user.userId} value={user.userId}>{user.fullName}</option>
                  ))}
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="ui-table min-w-[1150px] w-full">
                  <thead>
                    <tr className="border-b border-[var(--line)] bg-[var(--background)]/70 text-left">
                      <th className="px-4 py-3">Tarea</th>
                      <th className="px-4 py-3">Actividad</th>
                      <th className="px-4 py-3">Entrega</th>
                      <th className="px-4 py-3">Fecha límite</th>
                      <th className="px-4 py-3">Horas</th>
                      <th className="px-4 py-3">Base</th>
                      <th className="px-4 py-3">Calificación</th>
                      <th className="px-4 py-3">Guardar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedUser.tasks.map((task) => (
                      <tr key={task.id} className="border-b border-[var(--line)]/60">
                        <td className="px-4 py-3">
                          <p className="font-semibold">{task.title}</p>
                          <p className="text-xs text-[var(--ink-muted)]">{task.code} · {task.projectName}</p>
                        </td>
                        <td className="px-4 py-3">{activityLabels[task.activityType]}</td>
                        <td className={`px-4 py-3 font-semibold ${deliveryTone[task.deliveryStatus]}`}>{deliveryLabels[task.deliveryStatus]}</td>
                        <td className="px-4 py-3">{task.dueDate ?? "Sin fecha"}</td>
                        <td className="px-4 py-3">{formatNumber(task.estimatedHours)} h</td>
                        <td className="px-4 py-3 text-xs">{formatNumber(task.estimatedHours)} × {formatNumber(task.weight)} = {formatNumber(task.possiblePoints)} pts</td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.1"
                            aria-label={`Calificación de ${task.title}`}
                            value={gradeDrafts[task.id] ?? ""}
                            onChange={(event) => setGradeDrafts((current) => ({ ...current, [task.id]: event.target.value }))}
                            className="ui-control w-28"
                            placeholder="0-100"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            disabled={savingTaskId === task.id || gradeDrafts[task.id] === ""}
                            onClick={() => void saveGrade(task.id)}
                            className="ui-btn ui-btn-primary ui-btn-sm"
                          >
                            {savingTaskId === task.id ? "Guardando..." : "Guardar"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-[var(--line)] bg-[var(--background)]/50 px-5 py-4 text-sm">
                <strong>Resultado semestral: </strong>
                {selectedUser.finalGrade === null
                  ? "pendiente de calificaciones"
                  : `${formatNumber(selectedUser.earnedPoints)} de ${formatNumber(selectedUser.possiblePoints)} puntos = ${formatNumber(selectedUser.finalGrade)} / 100`}
              </div>
            </section>
          ) : null}

          <section className="kpi-card p-5 text-sm text-[var(--ink-muted)]">
            <h2 className="font-semibold text-[var(--foreground)]">Cómo se calcula el resultado</h2>
            <p className="mt-2">
              Base de cada tarea = horas estimadas × ponderación de su actividad. Puntos obtenidos = base × calificación ÷ 100.
              El resultado final es la suma de puntos obtenidos dividida entre la suma de bases de las tareas ya calificadas.
              El estado de entrega se determina automáticamente comparando la fecha de finalización con la fecha límite.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
