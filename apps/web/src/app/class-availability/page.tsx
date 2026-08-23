"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { API_URL, authHeaders, getStoredRole, getStoredToken } from "../../lib/api";

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
  updatedAt: string;
};
type AvailabilityRegistry = Record<string, AvailabilityRegistryEntry>;

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
    if (hour < 22) {
      slots.push(formatTime(hour, 30));
    }
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

    const entry = value as { availability?: unknown; updatedAt?: unknown };
    registry[userId] = {
      availability: normalizeAvailability(entry.availability),
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

        const loadedUsers = usersResponse.data as UserRow[];
        setUsers(loadedUsers);
        setSelectedUserId((current) => {
          if (current && loadedUsers.some((user) => user.id === current)) {
            return current;
          }
          return loadedUsers[0]?.id ?? "";
        });

        const registryResponse = await axios.get(`${API_URL}/teacher-availability/registry`, {
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
  }, [router]);

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
    const nextEntry: AvailabilityRegistryEntry = {
      availability: selectedAvailability,
      incidences: nextIncidences,
      updatedAt: new Date().toISOString(),
    };

    try {
      await axios.put(`${API_URL}/teacher-availability/users/${selectedUserId}`, nextEntry, {
        headers: authHeaders(),
      });

      setRegistry((current) => ({
        ...current,
        [selectedUserId]: nextEntry,
      }));
      setInfo("Incidencia eliminada correctamente.");
      setError("");
    } catch {
      setError("No se pudo borrar la incidencia seleccionada.");
      setInfo("");
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
          Consulta la disponibilidad semanal guardada por cada usuario.
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

      <section className="glass-panel fade-up p-4 md:p-5" style={{ animationDelay: "90ms" }}>
        <div className="max-w-sm">
          <label htmlFor="availability-user-select" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
            Usuario
          </label>
          <select
            id="availability-user-select"
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
            className="ui-control w-full"
          >
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.fullName}
              </option>
            ))}
          </select>
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

        <p className="mt-3 text-xs text-[var(--ink-soft)]">
          Usuario seleccionado: <span className="font-semibold text-[var(--foreground)]">{selectedUser?.fullName ?? "Sin selección"}</span>
          {" · "}
          Último guardado: <span className="font-semibold text-[var(--foreground)]">{formatDateTime(selectedEntry?.updatedAt ?? "")}</span>
        </p>

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
      </section>

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
    </div>
  );
}
