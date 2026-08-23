"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { API_URL, authHeaders, getStoredRole, getStoredToken } from "../../lib/api";

const WEEK_DAYS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;

type AvailabilityStatus = "full" | "confirm" | "busy";
type AvailabilityMap = Record<string, AvailabilityStatus>;
type IncidenceRow = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
};
type AvailabilityRegistryEntry = {
  availability: AvailabilityMap;
  incidences: IncidenceRow[];
  updatedAt: string;
};
type ClassSection = "availability" | "incidences" | "assigned";
type AssignedClassRow = {
  id: string;
  classDate: string;
  startTime: string;
  endTime: string;
  courseCode: string;
  courseName: string;
  subjectName: string;
  teacherName: string;
  coverTeacherName?: string;
  effectiveTeacherName?: string;
  isCovered?: boolean;
  notes?: string | null;
};

const STATUS_META: Record<AvailabilityStatus, { label: string; symbol: string; className: string }> = {
  full: {
    label: "Disponibilidad completa",
    symbol: "✓",
    className:
      "border-emerald-300/60 bg-emerald-400/25 text-emerald-100 shadow-[inset_0_0_0_1px_rgba(74,222,128,0.35)]",
  },
  confirm: {
    label: "Disponibilidad posible con confirmación",
    symbol: "?",
    className:
      "border-amber-300/60 bg-amber-300/25 text-amber-100 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.32)]",
  },
  busy: {
    label: "No disponible",
    symbol: "-",
    className:
      "border-rose-300/60 bg-rose-400/25 text-rose-100 shadow-[inset_0_0_0_1px_rgba(251,113,133,0.35)]",
  },
};

const STATUS_FLOW: AvailabilityStatus[] = ["full", "confirm", "busy"];

function normalizeAvailability(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return {} as AvailabilityMap;
  }

  const entries = Object.entries(raw as Record<string, unknown>);
  const normalized: AvailabilityMap = {};

  entries.forEach(([key, value]) => {
    if (typeof value === "string" && STATUS_FLOW.includes(value as AvailabilityStatus)) {
      normalized[key] = value as AvailabilityStatus;
    }
  });

  return normalized;
}

function normalizeIncidences(raw: unknown) {
  if (!Array.isArray(raw)) {
    return [] as IncidenceRow[];
  }

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const row = item as {
        id?: unknown;
        date?: unknown;
        startTime?: unknown;
        endTime?: unknown;
        reason?: unknown;
      };

      if (
        typeof row.date !== "string" ||
        typeof row.startTime !== "string" ||
        typeof row.endTime !== "string"
      ) {
        return null;
      }

      return {
        id: typeof row.id === "string" && row.id ? row.id : `${row.date}-${row.startTime}-${row.endTime}`,
        date: row.date,
        startTime: row.startTime,
        endTime: row.endTime,
        reason: typeof row.reason === "string" ? row.reason.trim() : "",
      };
    })
    .filter((item): item is IncidenceRow => item !== null);
}

function normalizeSavedPayload(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return {
      availability: {} as AvailabilityMap,
      incidences: [] as IncidenceRow[],
      updatedAt: "",
    };
  }

  const asRecord = raw as Record<string, unknown>;

  if ("availability" in asRecord || "incidences" in asRecord || "updatedAt" in asRecord) {
    return {
      availability: normalizeAvailability(asRecord.availability),
      incidences: normalizeIncidences(asRecord.incidences),
      updatedAt: typeof asRecord.updatedAt === "string" ? asRecord.updatedAt : "",
    };
  }

  return {
    availability: normalizeAvailability(raw),
    incidences: [] as IncidenceRow[],
    updatedAt: "",
  };
}

function formatTime(hour24: number, minute: number) {
  const suffix = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const minuteText = minute.toString().padStart(2, "0");
  return `${hour12}:${minuteText} ${suffix}`;
}

function buildTimeSlots() {
  const slots: string[] = [];

  for (let hour = 7; hour <= 22; hour += 1) {
    slots.push(formatTime(hour, 0));
  }

  return slots;
}

export default function ClassSchedulePage() {
  const router = useRouter();
  const [availability, setAvailability] = useState<AvailabilityMap>({});
  const [incidences, setIncidences] = useState<IncidenceRow[]>([]);
  const [saveMessage, setSaveMessage] = useState("");
  const [activeSection, setActiveSection] = useState<ClassSection>("availability");
  const [incidenceDate, setIncidenceDate] = useState("");
  const [incidenceStartTime, setIncidenceStartTime] = useState("07:00");
  const [incidenceEndTime, setIncidenceEndTime] = useState("07:30");
  const [incidenceReason, setIncidenceReason] = useState("");
  const [incidenceError, setIncidenceError] = useState("");
  const [hasPendingAvailabilityChanges, setHasPendingAvailabilityChanges] = useState(false);
  const [currentRole, setCurrentRole] = useState("");
  const [assignedClasses, setAssignedClasses] = useState<AssignedClassRow[]>([]);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.replace("/");
      return;
    }

    const role = getStoredRole();
    setCurrentRole(role);

    const loadData = async () => {
      try {
        const [availabilityResponse, assignedResponse] = await Promise.all([
          axios.get(`${API_URL}/teacher-availability/me`, {
            headers: authHeaders(),
          }),
          axios.get(`${API_URL}/class-planning/my-sessions`, {
            headers: authHeaders(),
          }),
        ]);

        const payload = normalizeSavedPayload(availabilityResponse.data as unknown);
        setAvailability(payload.availability);
        setIncidences(payload.incidences);
        setAssignedClasses(assignedResponse.data as AssignedClassRow[]);
      } catch {
        setAvailability({});
        setIncidences([]);
        setAssignedClasses([]);
      }
    };

    void loadData();
  }, [router]);

  const timeSlots = useMemo(() => buildTimeSlots(), []);
  const canDeleteIncidences = currentRole === "manager";

  const buildAvailabilitySnapshot = (source: AvailabilityMap) => {
    const snapshot: AvailabilityMap = {};
    timeSlots.forEach((slot) => {
      WEEK_DAYS.forEach((day) => {
        const cellKey = `${day}-${slot}`;
        snapshot[cellKey] = source[cellKey] ?? "full";
      });
    });

    return snapshot;
  };

  const persistData = async (
    nextAvailability: AvailabilityMap,
    nextIncidences: IncidenceRow[],
    message: string,
  ) => {
    const snapshot = buildAvailabilitySnapshot(nextAvailability);

    try {
      const payload: AvailabilityRegistryEntry = {
        availability: snapshot,
        incidences: nextIncidences,
        updatedAt: new Date().toISOString(),
      };

      await axios.put(`${API_URL}/teacher-availability/me`, payload, {
        headers: authHeaders(),
      });

      setSaveMessage(message);
    } catch {
      setSaveMessage("No se pudo guardar la disponibilidad.");
    }
  };

  const rotateStatus = (day: string, slot: string) => {
    const cellKey = `${day}-${slot}`;
    const active = availability[cellKey] ?? "full";
    const currentIndex = STATUS_FLOW.indexOf(active);
    const nextStatus = STATUS_FLOW[(currentIndex + 1) % STATUS_FLOW.length];
    const nextAvailability = {
      ...availability,
      [cellKey]: nextStatus,
    };

    setAvailability(nextAvailability);
    setHasPendingAvailabilityChanges(true);
    setSaveMessage("Tienes cambios en disponibilidad sin guardar.");
  };

  const onSaveAvailability = async () => {
    await persistData(availability, incidences, "Disponibilidad guardada correctamente.");
    setHasPendingAvailabilityChanges(false);
  };

  const onAddIncidence = async () => {
    if (!incidenceDate || !incidenceStartTime || !incidenceEndTime || incidenceReason.trim().length === 0) {
      setIncidenceError("Completa fecha, horario y motivo.");
      return;
    }

    if (incidenceStartTime >= incidenceEndTime) {
      setIncidenceError("La hora de fin debe ser mayor a la hora de inicio.");
      return;
    }

    const confirmed = window.confirm(
      `Confirmar incidencia\n\nFecha: ${incidenceDate}\nHorario: ${incidenceStartTime} - ${incidenceEndTime}\nMotivo: ${incidenceReason.trim()}`,
    );

    if (!confirmed) {
      return;
    }

    const newIncidence: IncidenceRow = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: incidenceDate,
      startTime: incidenceStartTime,
      endTime: incidenceEndTime,
      reason: incidenceReason.trim(),
    };

    setIncidences((current) => {
      const next = [...current, newIncidence];
      next.sort((a, b) => {
        const keyA = `${a.date}-${a.startTime}`;
        const keyB = `${b.date}-${b.startTime}`;
        return keyA.localeCompare(keyB);
      });
      return next;
    });

    const nextIncidences = [...incidences, newIncidence].sort((a, b) => {
      const keyA = `${a.date}-${a.startTime}`;
      const keyB = `${b.date}-${b.startTime}`;
      return keyA.localeCompare(keyB);
    });

    setIncidenceError("");
    setIncidenceReason("");
    await persistData(availability, nextIncidences, "Incidencia guardada automáticamente.");
    setHasPendingAvailabilityChanges(false);
  };

  const onRemoveIncidence = async (incidenceId: string) => {
    if (!canDeleteIncidences) {
      setSaveMessage("Solo gerencia puede borrar incidencias guardadas.");
      return;
    }

    const nextIncidences = incidences.filter((item) => item.id !== incidenceId);
    setIncidences(nextIncidences);
    await persistData(availability, nextIncidences, "Incidencia eliminada y guardada automáticamente.");
    setHasPendingAvailabilityChanges(false);
  };

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col gap-4 px-4 py-6 md:px-6">
      <header className="glass-panel fade-up p-5 md:p-6">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">
          Agenda semanal
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
          Clases
        </h1>
        <p className="mt-1.5 text-sm text-[var(--ink-muted)]">
          Administra tu disponibilidad semanal, incidencias puntuales y clases asignadas.
        </p>
      </header>

      <section className="glass-panel fade-up overflow-hidden p-0" style={{ animationDelay: "90ms" }}>
        <div className="border-b border-white/10 px-4 py-3 md:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveSection("availability")}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  activeSection === "availability"
                    ? "border-[var(--accent)] bg-[var(--accent)]/12 text-[var(--accent)]"
                    : "border-white/15 bg-white/5 text-[var(--ink-soft)] hover:border-white/30"
                }`}
              >
                Disponibilidad
              </button>
              <button
                type="button"
                onClick={() => setActiveSection("incidences")}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  activeSection === "incidences"
                    ? "border-[var(--accent)] bg-[var(--accent)]/12 text-[var(--accent)]"
                    : "border-white/15 bg-white/5 text-[var(--ink-soft)] hover:border-white/30"
                }`}
              >
                Incidencias
              </button>
              <button
                type="button"
                onClick={() => setActiveSection("assigned")}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  activeSection === "assigned"
                    ? "border-[var(--accent)] bg-[var(--accent)]/12 text-[var(--accent)]"
                    : "border-white/15 bg-white/5 text-[var(--ink-soft)] hover:border-white/30"
                }`}
              >
                Clases Asignadas
              </button>
            </div>

            <div className="flex items-center gap-2">
              {activeSection === "availability" ? (
                <button
                  type="button"
                  onClick={onSaveAvailability}
                  className="ui-btn ui-btn-primary h-8 px-3 text-xs"
                >
                  Guardar cambios
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-2 min-h-5 text-xs text-[var(--ink-soft)]">
            {saveMessage ? saveMessage : hasPendingAvailabilityChanges ? "Tienes cambios en disponibilidad sin guardar." : ""}
          </div>
        </div>

        {activeSection === "availability" ? (
          <>
            <div className="border-b border-white/10 px-4 py-3 md:px-5">
              <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--ink-soft)]">
                {STATUS_FLOW.map((status) => (
                  <span key={status} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                    <span
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-md border text-[11px] font-semibold ${STATUS_META[status].className}`}
                      aria-hidden="true"
                    >
                      {STATUS_META[status].symbol}
                    </span>
                    {STATUS_META[status].label}
                  </span>
                ))}
              </div>
            </div>

            <div className="overflow-auto">
              <div className="min-w-[490px]">
                <div
                  className="grid bg-[color:var(--panel-bg)]"
                  style={{ gridTemplateColumns: "70px repeat(7, minmax(60px, 1fr))" }}
                >
                  <div className="sticky left-0 top-0 z-30 rounded-lg border border-white/15 bg-[var(--surface-strong)] px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-soft)]">
                    Hora
                  </div>

                  {WEEK_DAYS.map((day) => (
                    <div
                      key={day}
                      className="sticky top-0 z-20 rounded-lg border border-white/15 bg-[var(--surface-strong)] px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-soft)]"
                    >
                      {day}
                    </div>
                  ))}

                  {timeSlots.map((slot) => (
                    <Fragment key={slot}>
                      <div
                        key={`${slot}-time`}
                        className="sticky left-0 z-10 rounded-lg border border-white/10 bg-[var(--surface)] px-2 py-1.5 text-[10px] font-medium text-[var(--accent)]"
                      >
                        {slot}
                      </div>

                      {WEEK_DAYS.map((day) => {
                        const cellKey = `${day}-${slot}`;
                        const status = availability[cellKey] ?? "full";
                        const statusMeta = STATUS_META[status];

                        return (
                          <button
                            key={cellKey}
                            type="button"
                            onClick={() => rotateStatus(day, slot)}
                            aria-label={`${day} ${slot}: ${statusMeta.label}`}
                            title={`${day} ${slot} - ${statusMeta.label}`}
                            className="group h-6 border border-white/10 bg-white/[0.02] p-0 text-left transition hover:border-white/30 hover:bg-white/[0.04]"
                          >
                            <span
                              className={`flex h-full w-full items-center justify-center border text-[10px] font-semibold transition ${statusMeta.className}`}
                            >
                              {statusMeta.symbol}
                            </span>
                          </button>
                        );
                      })}
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : null}

        {activeSection === "incidences" ? (
          <div className="px-4 py-3 md:px-5">
            <div className="rounded-xl border border-white/12 bg-white/[0.03] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                Registrar incidencia
              </p>

              <div className="mt-2 grid gap-2 sm:grid-cols-4">
                <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
                  Fecha
                  <input
                    type="date"
                    value={incidenceDate}
                    onChange={(event) => setIncidenceDate(event.target.value)}
                    className="ui-control"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
                  Hora inicio
                  <input
                    type="time"
                    step={1800}
                    value={incidenceStartTime}
                    onChange={(event) => setIncidenceStartTime(event.target.value)}
                    className="ui-control"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
                  Hora fin
                  <input
                    type="time"
                    step={1800}
                    value={incidenceEndTime}
                    onChange={(event) => setIncidenceEndTime(event.target.value)}
                    className="ui-control"
                  />
                </label>

                <label className="sm:col-span-2 flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
                  Motivo
                  <input
                    type="text"
                    value={incidenceReason}
                    onChange={(event) => setIncidenceReason(event.target.value)}
                    placeholder="Ejemplo: Cita médica"
                    className="ui-control"
                  />
                </label>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" onClick={onAddIncidence} className="ui-btn ui-btn-primary h-8 px-3 text-xs">
                  Agregar incidencia
                </button>
                {incidenceError ? (
                  <span className="text-xs text-[var(--danger)]">{incidenceError}</span>
                ) : null}
              </div>

              <div className="mt-3 space-y-1.5">
                {incidences.length === 0 ? (
                  <p className="text-xs text-[var(--ink-soft)]">
                    No hay incidencias registradas.
                  </p>
                ) : (
                  incidences.map((incidence) => (
                    <div
                      key={incidence.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2 text-xs"
                    >
                      <span className="text-[var(--foreground)]">
                        {incidence.date} · {incidence.startTime} - {incidence.endTime}
                        {incidence.reason ? ` · Motivo: ${incidence.reason}` : ""}
                      </span>
                      {canDeleteIncidences ? (
                        <button
                          type="button"
                          onClick={() => onRemoveIncidence(incidence.id)}
                          className="rounded-md border border-rose-300/40 bg-rose-300/10 px-2 py-0.5 text-[11px] font-medium text-rose-700"
                        >
                          Quitar
                        </button>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}

        {activeSection === "assigned" ? (
          <div className="px-4 py-3 md:px-5">
            <div className="rounded-xl border border-white/12 bg-white/[0.03] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                Clases asignadas
              </p>
              <div className="mt-2 space-y-1.5">
                {assignedClasses.length === 0 ? (
                  <p className="text-sm text-[var(--ink-soft)]">Aún no tienes clases programadas.</p>
                ) : (
                  assignedClasses.map((assignedClass) => (
                    <div
                      key={assignedClass.id}
                      className="rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2 text-xs"
                    >
                      <p className="font-semibold text-[var(--foreground)]">
                        {assignedClass.classDate} · {assignedClass.startTime.slice(0, 5)} - {assignedClass.endTime.slice(0, 5)}
                      </p>
                      <p className="text-[var(--ink-soft)]">
                        {assignedClass.courseCode} · {assignedClass.courseName}
                      </p>
                      <p className="text-[var(--ink-soft)]">
                        {assignedClass.subjectName}
                        {assignedClass.isCovered
                          ? ` · Cobertura: ${assignedClass.effectiveTeacherName || assignedClass.coverTeacherName || "Asignada"}`
                          : ""}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
