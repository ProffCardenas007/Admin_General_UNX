"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { API_URL, authHeaders, getStoredRole, getStoredToken } from "../../lib/api";
import WeekSchedule, { type AssignedClassRow } from "../class-schedule/WeekSchedule";
import ImportPanel from "./ImportPanel";
import CalendarSelect from "../class-schedule/CalendarSelect";
import { currentCalendar } from "../../lib/calendar";
import TeachingProfile, { EMPTY_TEACHING, type Teaching } from "../class-schedule/TeachingProfile";
import type { PlanningNotify } from "./types";
import { sortByLabel } from "../../lib/sort";

type UserRow = {
  id: string;
  fullName: string;
  email: string;
  role: "manager" | "lead" | "worker";
  isActive: boolean;
};

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
  teaching?: Teaching;
  savedCalendars?: string[];
  updatedAt: string;
};
type AvailabilityRegistry = Record<string, AvailabilityRegistryEntry>;
type ClassSection = "availability" | "incidences" | "schedule";

const SECTIONS: Array<{ id: ClassSection; label: string }> = [
  { id: "availability", label: "Disponibilidad" },
  { id: "incidences", label: "Incidencias" },
  { id: "schedule", label: "Horario" },
];

const WEEK_DAYS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;

const STATUS_META: Record<AvailabilityStatus, { label: string; symbol: string; className: string }> = {
  full: {
    label: "Disponibilidad completa",
    symbol: "✓",
    className:
      "border-emerald-300/60 bg-emerald-400/25 text-emerald-100 shadow-[inset_0_0_0_1px_rgba(74,222,128,0.35)]",
  },
  confirm: {
    label: "Posible con confirmación",
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

function normalizeRegistry(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return {} as AvailabilityRegistry;
  }

  const registry: AvailabilityRegistry = {};

  Object.entries(raw as Record<string, unknown>).forEach(([userId, value]) => {
    if (!value || typeof value !== "object") {
      return;
    }

    const entry = value as { availability?: unknown; teaching?: Teaching; savedCalendars?: string[]; updatedAt?: unknown };
    registry[userId] = {
      availability: normalizeAvailability(entry.availability),
      teaching: entry.teaching,
      savedCalendars: entry.savedCalendars,
      incidences: normalizeIncidences((entry as { incidences?: unknown }).incidences),
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : "",
    };
  });

  return registry;
}

function formatDateTime(value: string) {
  if (!value) {
    return "Sin registro";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Sin registro";
  }

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function ClassAvailabilityPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [registry, setRegistry] = useState<AvailabilityRegistry>({});
  const [selectedUserId, setSelectedUserId] = useState("");
  const [savingTeaching, setSavingTeaching] = useState(false);
  const [calendar, setCalendar] = useState(() => currentCalendar());
  // Sube tras importar o reiniciar para volver a pedir los datos.
  const [dataVersion, setDataVersion] = useState(0);
  const notify = useMemo<PlanningNotify>(
    () => ({
      error: setError,
      info: setInfo,
      clear: () => {
        setError("");
        setInfo("");
      },
    }),
    [],
  );
  const [activeSection, setActiveSection] = useState<ClassSection>("availability");
  const [wholeTeam, setWholeTeam] = useState(false);
  // El horario guarda de quién es, para no mostrar el de otra persona mientras carga.
  const [schedule, setSchedule] = useState<{ key: string; classes: AssignedClassRow[]; failed: boolean }>({
    key: "",
    classes: [],
    failed: false,
  });
  const scheduleKey = wholeTeam ? "all" : selectedUserId;

  useEffect(() => {
    if (!scheduleKey || getStoredRole() !== "manager") return;
    let cancelled = false;
    const url =
      scheduleKey === "all"
        ? `${API_URL}/class-planning/sessions`
        : `${API_URL}/class-planning/my-sessions?userId=${encodeURIComponent(scheduleKey)}`;
    axios
      .get(url, { headers: authHeaders() })
      .then((response) => {
        if (!cancelled) setSchedule({ key: scheduleKey, classes: response.data as AssignedClassRow[], failed: false });
      })
      .catch(() => {
        if (!cancelled) setSchedule({ key: scheduleKey, classes: [], failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [scheduleKey, dataVersion]);

  const timeSlots = useMemo(() => buildTimeSlots(), []);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.replace("/");
      return;
    }

    const role = getStoredRole();
    if (role !== "manager") {
      router.replace("/dashboard");
      return;
    }

    const loadData = async () => {
      try {
        const usersResponse = await axios.get(`${API_URL}/users`, {
          headers: authHeaders(),
        });

        const loadedUsers = sortByLabel(usersResponse.data as UserRow[], (user) => user.fullName);
        setUsers(loadedUsers);
        setSelectedUserId((current) => {
          if (current && loadedUsers.some((user) => user.id === current)) {
            return current;
          }
          return loadedUsers[0]?.id ?? "";
        });

        const registryResponse = await axios.get(`${API_URL}/teacher-availability/registry?calendar=${calendar}`, {
          headers: authHeaders(),
        });
        setRegistry(normalizeRegistry(registryResponse.data as unknown));
      } catch {
        setError("No se pudo cargar la disponibilidad de los usuarios.");
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, [router, dataVersion, calendar]);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId),
    [users, selectedUserId],
  );

  const selectedEntry = useMemo(() => {
    if (!selectedUserId) {
      return undefined;
    }

    return registry[selectedUserId];
  }, [registry, selectedUserId]);

  const selectedAvailability = selectedEntry?.availability ?? {};
  const selectedIncidences = selectedEntry?.incidences ?? [];

  const onDeleteIncidence = async (incidenceId: string) => {
    if (!selectedUserId) {
      return;
    }

    const confirmed = window.confirm("¿Deseas borrar esta incidencia?");
    if (!confirmed) {
      return;
    }

    const nextIncidences = selectedIncidences.filter((item) => item.id !== incidenceId);
    try {
      await axios.put(
        `${API_URL}/teacher-availability/users/${selectedUserId}`,
        { incidences: nextIncidences },
        { headers: authHeaders() },
      );

      setRegistry((current) => ({
        ...current,
        [selectedUserId]: { ...current[selectedUserId], incidences: nextIncidences },
      }));
      setInfo("Incidencia eliminada correctamente.");
      setError("");
    } catch {
      setError("No se pudo borrar la incidencia seleccionada.");
      setInfo("");
    }
  };

  const onTeachingChange = async (next: Teaching) => {
    const userId = selectedUserId;
    setSavingTeaching(true);
    try {
      const response = await axios.put<AvailabilityRegistryEntry>(
        `${API_URL}/teacher-availability/users/${userId}`,
        { teaching: next, calendar },
        { headers: authHeaders() },
      );
      setRegistry((current) => ({ ...current, [userId]: response.data }));
      setInfo("Datos del profesor guardados.");
      setError("");
    } catch {
      setError("No se pudieron guardar los datos del profesor.");
      setInfo("");
    } finally {
      setSavingTeaching(false);
    }
  };

  const summary = useMemo(() => {
    const totals: Record<AvailabilityStatus, number> = {
      full: 0,
      confirm: 0,
      busy: 0,
    };

    timeSlots.forEach((slot) => {
      WEEK_DAYS.forEach((day) => {
        const key = `${day}-${slot}`;
        const status = selectedAvailability[key] ?? "full";
        totals[status] += 1;
      });
    });

    return totals;
  }, [selectedAvailability, timeSlots]);

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-[1320px] flex-1 items-center justify-center px-4 py-8 md:px-6">
        <p className="text-sm text-[var(--ink-soft)]">Cargando disponibilidad...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col gap-4 px-4 py-6 md:px-6">
      <header className="glass-panel fade-up p-5 md:p-6">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">
          Vista de gerencia
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
          Programación de clases del equipo
        </h1>
        <p className="mt-1.5 text-sm text-[var(--ink-muted)]">
          Importa la programación y consulta la disponibilidad, las incidencias y el horario de cada persona.
        </p>
        {error ? (
          <p className="mt-3 rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="mt-3 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2 text-sm text-[var(--accent)]">
            {info}
          </p>
        ) : null}
      </header>

      <ImportPanel calendar={calendar} notify={notify} reload={async () => setDataVersion((current) => current + 1)} />

      <section className="glass-panel fade-up p-4 md:p-5" style={{ animationDelay: "90ms" }}>
        <div className="flex flex-wrap items-end gap-4">
          <CalendarSelect
            value={calendar}
            saved={Object.values(registry).flatMap((entry) => entry.savedCalendars ?? [])}
            onChange={setCalendar}
          />
        <div className="w-full max-w-sm">
          <label htmlFor="availability-user-select" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
            Usuario
          </label>
          <select
            id="availability-user-select"
            value={selectedUserId}
            onChange={(event) => {
              setSelectedUserId(event.target.value);
              setWholeTeam(false);
            }}
            className="ui-control w-full"
          >
            {sortByLabel(users, (user) => user.fullName).map((user) => (
              <option key={user.id} value={user.id}>
                {user.fullName}
              </option>
            ))}
          </select>
        </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Secciones">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={activeSection === section.id}
              onClick={() => setActiveSection(section.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                activeSection === section.id
                  ? "border-[var(--accent)] bg-[var(--accent)]/12 text-[var(--accent)]"
                  : "border-white/15 bg-white/5 text-[var(--ink-soft)] hover:border-white/30"
              }`}
            >
              {section.label}
              {section.id === "incidences" && selectedIncidences.length > 0 ? ` (${selectedIncidences.length})` : ""}
            </button>
          ))}
        </div>

        {activeSection === "availability" ? (
          <>
        {!selectedEntry?.updatedAt ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            {selectedUser?.fullName ?? "Esta persona"} aún no ha guardado su disponibilidad de {calendar}; la cuadrícula en verde no significa que esté disponible.
          </p>
        ) : null}
        <div className="mt-4">
          <TeachingProfile
            value={selectedEntry?.teaching ?? EMPTY_TEACHING}
            onChange={onTeachingChange}
            disabled={savingTeaching || !selectedUserId}
          />
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {STATUS_FLOW.map((status) => (
            <div key={status} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                {STATUS_META[status].label}
              </p>
              <p className="mt-1 text-base font-semibold text-[var(--accent)]">{summary[status]}</p>
            </div>
          ))}
        </div>

          </>
        ) : null}

        <p className="mt-3 text-xs text-[var(--ink-soft)]">
          Usuario seleccionado: <span className="font-semibold text-[var(--foreground)]">{selectedUser?.fullName ?? "Sin selección"}</span>
          {" · "}
          Último guardado: <span className="font-semibold text-[var(--foreground)]">{formatDateTime(selectedEntry?.updatedAt ?? "")}</span>
        </p>

        {activeSection === "incidences" ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
            Incidencias
          </p>
          <div className="mt-2 space-y-1.5">
            {selectedIncidences.length === 0 ? (
              <p className="text-xs text-[var(--ink-soft)]">Sin incidencias registradas.</p>
            ) : (
              selectedIncidences.map((incidence) => (
                <div
                  key={incidence.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-300/30 bg-rose-300/10 px-2.5 py-2 text-xs text-[var(--foreground)]"
                >
                  <span>
                    {incidence.date} · {incidence.startTime} - {incidence.endTime}
                    {incidence.reason ? ` · Motivo: ${incidence.reason}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeleteIncidence(incidence.id)}
                    className="rounded-md border border-rose-300/40 bg-rose-300/10 px-2 py-0.5 text-[11px] font-medium text-rose-700"
                  >
                    Quitar
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
        ) : null}

        {activeSection === "schedule" ? (
          <div className="mt-3">
            <WeekSchedule
              title={wholeTeam ? "Horario de todo el equipo" : `Horario de ${selectedUser?.fullName ?? "—"}`}
              classes={schedule.key === scheduleKey ? schedule.classes : []}
              loading={schedule.key !== scheduleKey}
              emptyText={schedule.failed ? "No se pudo cargar el horario." : "No hay clases programadas."}
              showTeacher={wholeTeam}
              controls={
                <label className="flex h-9 items-center gap-2 text-xs text-[var(--ink-soft)]">
                  <input type="checkbox" checked={wholeTeam} onChange={(event) => setWholeTeam(event.target.checked)} />
                  Ver todo el equipo
                </label>
              }
            />
          </div>
        ) : null}
      </section>

      {activeSection === "availability" ? (
      <section className="glass-panel fade-up overflow-hidden p-0" style={{ animationDelay: "120ms" }}>
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
                    className="sticky left-0 z-10 rounded-lg border border-white/10 bg-[var(--surface)] px-2 py-1.5 text-[10px] font-medium text-[var(--ink-soft)]"
                  >
                    {slot}
                  </div>

                  {WEEK_DAYS.map((day) => {
                    const key = `${day}-${slot}`;
                    const status = selectedAvailability[key] ?? "full";
                    const statusMeta = STATUS_META[status];

                    return (
                      <div key={key} className="h-6 border border-white/10 bg-white/[0.02] p-0">
                        <span
                          className={`flex h-full w-full items-center justify-center border text-[10px] font-semibold ${statusMeta.className}`}
                          title={`${day} ${slot} - ${statusMeta.label}`}
                        >
                          {statusMeta.symbol}
                        </span>
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      </section>
      ) : null}
    </div>
  );
}
