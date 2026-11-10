"use client";

import axios from "axios";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
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
  manualGrade: number | null;
  autoZero: boolean;
  lateCapApplied: boolean;
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
  lateGradeCap: number;
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

const PAGE_SIZE = 10;

/**
 * Semestre de una fecha:
 * 2 = 15 de mayo al 15 de noviembre del año;
 * 1 = 16 de noviembre del año anterior al 14 de mayo del año.
 */
const currentSemester = (date: Date): { year: number; semester: 1 | 2 } => {
  const year = date.getFullYear();
  const monthDay = (date.getMonth() + 1) * 100 + date.getDate(); // 515 = 15 de mayo
  if (monthDay >= 515 && monthDay <= 1115) return { year, semester: 2 };
  if (monthDay > 1115) return { year: year + 1, semester: 1 };
  return { year, semester: 1 };
};

const semesterLabel = (year: number, semester: 1 | 2) =>
  semester === 2
    ? `15 mayo a 15 noviembre ${year}`
    : `16 noviembre ${year - 1} a 14 mayo ${year}`;

export default function SemesterEvaluationPanel() {
  const [initialSemester] = useState(() => currentSemester(new Date()));
  const [year, setYear] = useState(initialSemester.year);
  const [semester, setSemester] = useState<1 | 2>(initialSemester.semester);
  const [report, setReport] = useState<SemesterReport | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [weightDrafts, setWeightDrafts] = useState<Record<ActivityType, string>>(
    Object.fromEntries(activityOrder.map((activity) => [activity, "0"])) as Record<ActivityType, string>,
  );
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingWeights, setSavingWeights] = useState(false);
  const [savingGrades, setSavingGrades] = useState(false);
  const [onlyUngraded, setOnlyUngraded] = useState(true);
  const [page, setPage] = useState(0);
  const [fillValue, setFillValue] = useState("100");
  const gradeInputs = useRef<Array<HTMLInputElement | null>>([]);
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
            user.tasks.map((task) => [task.id, task.manualGrade === null ? "" : String(task.manualGrade)]),
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

  // Calificación guardada de cada tarea, para saber qué cambió sin guardar.
  const savedGrades = useMemo(
    () =>
      new Map(
        (report?.users ?? []).flatMap((user) =>
          user.tasks.map((task) => [task.id, task.manualGrade === null ? "" : String(task.manualGrade)] as const),
        ),
      ),
    [report],
  );

  const pendingGrades = useMemo(
    () =>
      Object.entries(gradeDrafts)
        .filter(([taskId, value]) => value.trim() !== "" && value.trim() !== (savedGrades.get(taskId) ?? ""))
        .map(([taskId, value]) => ({ taskId, grade: Number(value) })),
    [gradeDrafts, savedGrades],
  );
  const invalidPending = pendingGrades.filter(
    (row) => !Number.isFinite(row.grade) || row.grade < 0 || row.grade > 100,
  );
  const hasUnsaved = pendingGrades.length > 0;

  // Aviso del navegador si se intenta salir con calificaciones sin guardar.
  useEffect(() => {
    if (!hasUnsaved) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsaved]);

  const visibleTasks = useMemo(
    () =>
      (selectedUser?.tasks ?? []).filter(
        (task) => !onlyUngraded || (task.manualGrade === null && !task.autoZero),
      ),
    [onlyUngraded, selectedUser],
  );
  const pageCount = Math.max(1, Math.ceil(visibleTasks.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageTasks = visibleTasks.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const confirmDiscard = () =>
    !hasUnsaved || window.confirm("Tienes calificaciones sin guardar. ¿Descartarlas?");

  const changePeriod = (next: { year?: number; semester?: 1 | 2 }) => {
    if (!confirmDiscard()) return;
    if (next.year !== undefined) setYear(next.year);
    if (next.semester !== undefined) setSemester(next.semester);
    setPage(0);
  };

  const selectUser = (userId: string) => {
    // Los borradores se conservan al cambiar de persona: se guardan todos juntos.
    setSelectedUserId(userId);
    setPage(0);
  };

  const onGradeKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const next = gradeInputs.current[index + (event.shiftKey ? -1 : 1)];
    if (next) {
      next.focus();
      next.select();
    }
  };

  const fillEmptyOnPage = () => {
    const value = Number(fillValue);
    if (fillValue.trim() === "" || !Number.isFinite(value) || value < 0 || value > 100) {
      setError("El valor para rellenar debe estar entre 0 y 100.");
      return;
    }
    setError("");
    setGradeDrafts((current) => {
      const next = { ...current };
      pageTasks.forEach((task) => {
        if ((next[task.id] ?? "").trim() === "") next[task.id] = String(value);
      });
      return next;
    });
  };

  const discardGrades = () => {
    setGradeDrafts(Object.fromEntries(savedGrades));
    setNotice("");
  };

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

  const saveAllGrades = async () => {
    if (!hasUnsaved) return;
    if (invalidPending.length > 0) {
      setError(`Hay ${invalidPending.length} calificación(es) fuera de 0 a 100. Corrígelas antes de guardar.`);
      return;
    }
    setSavingGrades(true);
    setError("");
    setNotice("");
    try {
      await axios.put(
        `${API_URL}/reports/tasks/evaluations`,
        { evaluations: pendingGrades },
        { headers: authHeaders() },
      );
      setNotice(`${pendingGrades.length} calificación(es) guardada(s).`);
      await loadReport();
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "No se pudieron guardar las calificaciones; no se guardó ninguna."));
    } finally {
      setSavingGrades(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="kpi-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Evaluación semestral</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Califica las tareas de 0 a 100 (Enter pasa a la siguiente) y guarda todas juntas al final.
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
                onChange={(event) => changePeriod({ year: Number(event.target.value) })}
                className="ui-control mt-2"
              />
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              Semestre
              <select
                value={semester}
                onChange={(event) => changePeriod({ semester: Number(event.target.value) as 1 | 2 })}
                className="ui-control mt-2"
              >
                <option value={2}>{semesterLabel(year, 2)}</option>
                <option value={1}>{semesterLabel(year, 1)}</option>
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
                  Cada valor multiplica las horas estimadas de la tarea. Los cambios solo aplican a {semesterLabel(year, semester).toLowerCase()}.
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
                Las tareas no entregadas cuentan como 0 automáticamente; las pendientes (aún en tiempo) no afectan el resultado.
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
                        <button type="button" onClick={() => selectUser(user.userId)} className="ui-btn ui-btn-secondary ui-btn-sm">
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
                <select value={selectedUserId} onChange={(event) => selectUser(event.target.value)} className="ui-control md:max-w-sm">
                  {report.users.map((user) => (
                    <option key={user.userId} value={user.userId}>{user.fullName}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-3 border-b border-[var(--line)] bg-[var(--background)]/40 px-5 py-3 text-sm lg:flex-row lg:items-center lg:justify-between">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={onlyUngraded}
                    onChange={(event) => {
                      setOnlyUngraded(event.target.checked);
                      setPage(0);
                    }}
                  />
                  Solo tareas sin calificar
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[var(--ink-muted)]">Rellenar vacías de esta página con</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={fillValue}
                    onChange={(event) => setFillValue(event.target.value)}
                    aria-label="Calificación para rellenar"
                    className="ui-control w-20"
                  />
                  <button type="button" onClick={fillEmptyOnPage} disabled={pageTasks.length === 0} className="ui-btn ui-btn-secondary ui-btn-sm">
                    Rellenar
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="ui-table min-w-[1050px] w-full">
                  <thead>
                    <tr className="border-b border-[var(--line)] bg-[var(--background)]/70 text-left">
                      <th className="px-4 py-3">Tarea</th>
                      <th className="px-4 py-3">Actividad</th>
                      <th className="px-4 py-3">Entrega</th>
                      <th className="px-4 py-3">Fecha límite</th>
                      <th className="px-4 py-3">Horas</th>
                      <th className="px-4 py-3">Base</th>
                      <th className="px-4 py-3">Calificación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageTasks.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-sm text-[var(--ink-muted)]">
                          {onlyUngraded
                            ? "Todas las tareas de esta persona ya están calificadas."
                            : "Esta persona no tiene tareas en el semestre."}
                        </td>
                      </tr>
                    ) : null}
                    {pageTasks.map((task, index) => {
                      const draft = gradeDrafts[task.id] ?? "";
                      const changed = draft.trim() !== "" && draft.trim() !== (savedGrades.get(task.id) ?? "");
                      const draftNumber = Number(draft);
                      const invalid = changed && (!Number.isFinite(draftNumber) || draftNumber < 0 || draftNumber > 100);
                      return (
                      <tr key={task.id} className={`border-b border-[var(--line)]/60 ${changed ? "bg-amber-50/60" : ""}`}>
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
                            ref={(element) => {
                              gradeInputs.current[index] = element;
                            }}
                            value={draft}
                            onChange={(event) => setGradeDrafts((current) => ({ ...current, [task.id]: event.target.value }))}
                            onKeyDown={(event) => onGradeKeyDown(event, index)}
                            onFocus={(event) => event.target.select()}
                            className={`ui-control w-28 ${invalid ? "border-[var(--danger)]" : ""}`}
                            placeholder="0-100"
                          />
                          {changed ? (
                            <p className={`mt-1 text-xs font-semibold ${invalid ? "text-[var(--danger)]" : "text-amber-700"}`}>
                              {invalid ? "Debe estar entre 0 y 100" : "Sin guardar"}
                            </p>
                          ) : null}
                          {task.autoZero ? (
                            <p className="mt-1 text-xs font-semibold text-[var(--danger)]">0 automático (no entregada)</p>
                          ) : null}
                          {task.lateCapApplied ? (
                            <p className="mt-1 text-xs font-semibold text-amber-700">
                              Tope por entrega tardía: cuenta como {formatNumber(task.grade ?? 0, 0)}
                            </p>
                          ) : null}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {visibleTasks.length > PAGE_SIZE ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] px-5 py-3 text-sm">
                  <span className="text-[var(--ink-muted)]">
                    Tareas {safePage * PAGE_SIZE + 1}–{Math.min(visibleTasks.length, (safePage + 1) * PAGE_SIZE)} de {visibleTasks.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setPage(safePage - 1)} disabled={safePage === 0} className="ui-btn ui-btn-secondary ui-btn-sm">
                      Anteriores 10
                    </button>
                    <span className="text-[var(--ink-muted)]">Página {safePage + 1} de {pageCount}</span>
                    <button type="button" onClick={() => setPage(safePage + 1)} disabled={safePage >= pageCount - 1} className="ui-btn ui-btn-secondary ui-btn-sm">
                      Siguientes 10
                    </button>
                  </div>
                </div>
              ) : null}
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
              Las tareas no entregadas (vencidas sin terminar) cuentan como 0 automáticamente, aunque puedes capturarles una calificación manual.
              Las entregas tardías tienen un tope de {report.lateGradeCap} de calificación.
              El estado de entrega se determina automáticamente comparando la fecha de finalización con la fecha límite.
            </p>
          </section>
        </>
      ) : null}

      {hasUnsaved ? (
        <div className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-2xl border border-amber-300 bg-white px-5 py-3 shadow-lg sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            <strong>{pendingGrades.length}</strong> calificación(es) sin guardar
            {invalidPending.length > 0 ? (
              <span className="ml-2 font-semibold text-[var(--danger)]">· {invalidPending.length} fuera de rango</span>
            ) : null}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={discardGrades} disabled={savingGrades} className="ui-btn ui-btn-secondary ui-btn-sm">
              Descartar
            </button>
            <button type="button" onClick={() => void saveAllGrades()} disabled={savingGrades} className="ui-btn ui-btn-primary ui-btn-sm">
              {savingGrades ? "Guardando..." : `Guardar ${pendingGrades.length} calificación(es)`}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
