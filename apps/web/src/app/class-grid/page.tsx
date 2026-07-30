"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { API_URL, authHeaders, getStoredRole, getStoredToken } from "../../lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

type SessionRow = {
  id: string;
  classDate: string;
  startTime: string;
  endTime: string;
  classroom: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  subjectName: string;
  teacherName: string;
  effectiveTeacherName?: string;
  isCovered?: boolean;
  hasTitularIncidenceConflict?: boolean;
  incidenceReason?: string;
  courseModality?: "presencial" | "virtual";
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns YYYY-MM-DD of the Monday of the ISO week containing `dateStr`. */
function getISOWeekMonday(dateStr: string): string {
  const d = new Date(`${dateStr.slice(0, 10)}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun, 1=Mon, …
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addWeeks(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

function formatDateShort(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return d.toLocaleDateString("es-MX", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatDateLong(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return d.toLocaleDateString("es-MX", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function sortRooms(rooms: string[]): string[] {
  const parseRoom = (r: string): [string, number] => {
    const m = r.match(/^(Aula|Sala)\s+(\d+)$/i);
    return m ? [m[1].toLowerCase(), Number(m[2])] : ["z", 999];
  };
  return [...rooms].sort((a, b) => {
    const [typeA, numA] = parseRoom(a);
    const [typeB, numB] = parseRoom(b);
    if (typeA !== typeB) return typeA < typeB ? -1 : 1;
    return numA - numB;
  });
}

const COURSE_CODE_COLORS: Record<string, string> = {
  Curso:          "border-[var(--accent)]/40  bg-[var(--accent)]/10  text-[var(--accent)]",
  Regularización: "border-emerald-400/40      bg-emerald-400/10      text-emerald-300",
  Asesorías:      "border-amber-400/40        bg-amber-400/10        text-amber-300",
  Examen:         "border-rose-400/40         bg-rose-400/10         text-rose-300",
};

function courseColor(code: string) {
  return COURSE_CODE_COLORS[code] ?? "border-white/20 bg-white/5 text-[var(--foreground)]";
}

// ── Component ────────────────────────────────────────────────────────────────

const WEEKS_PER_PAGE = 8;

export default function ClassGridPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  // Week navigation: anchorWeek = ISO monday of first visible week
  const [anchorWeek, setAnchorWeek] = useState<string>("");
  const [nameFilter, setNameFilter] = useState("");
  const [showOnlyConflicts, setShowOnlyConflicts] = useState(false);

  // ── Auth & load ───────────────────────────────────────────────────────────

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

    axios
      .get<SessionRow[]>(`${API_URL}/class-planning/sessions`, { headers: authHeaders() })
      .then((res) => {
        setSessions(res.data);

        // Set anchor to Monday of the earliest session, or today
        const dates = res.data.map((s) => s.classDate).sort();
        const earliest = dates[0];
        if (earliest) {
          const todayMonday = getISOWeekMonday(new Date().toISOString().slice(0, 10));
          // Use today's week if it's within range, otherwise use earliest
          const latestDate = dates[dates.length - 1]!;
          const todayInRange = todayMonday >= getISOWeekMonday(earliest) && todayMonday <= getISOWeekMonday(latestDate);
          setAnchorWeek(todayInRange ? todayMonday : getISOWeekMonday(earliest));
        }
      })
      .catch((err) => {
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          router.replace("/");
        } else {
          setError("No se pudieron cargar las sesiones.");
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const filteredSessions = useMemo(() => {
    let result = sessions;
    if (nameFilter.trim()) {
      const q = nameFilter.toLowerCase();
      result = result.filter(
        (s) =>
          s.courseName.toLowerCase().includes(q) ||
          s.subjectName.toLowerCase().includes(q) ||
          (s.effectiveTeacherName ?? s.teacherName).toLowerCase().includes(q),
      );
    }
    if (showOnlyConflicts) {
      result = result.filter((s) => s.hasTitularIncidenceConflict && !s.isCovered);
    }
    return result;
  }, [sessions, nameFilter, showOnlyConflicts]);

  // All ISO-week mondays that have at least one session in filteredSessions
  const allWeekMondays = useMemo(() => {
    const set = new Set(filteredSessions.map((s) => getISOWeekMonday(s.classDate)));
    return [...set].sort();
  }, [filteredSessions]);

  // Weeks visible in current page
  const visibleWeekMondays = useMemo(() => {
    if (!anchorWeek || allWeekMondays.length === 0) return allWeekMondays.slice(0, WEEKS_PER_PAGE);
    const startIdx = allWeekMondays.indexOf(anchorWeek);
    const from = startIdx === -1 ? 0 : startIdx;
    return allWeekMondays.slice(from, from + WEEKS_PER_PAGE);
  }, [allWeekMondays, anchorWeek]);

  // Rooms that appear in any visible-week session
  const visibleRooms = useMemo(() => {
    const weekSet = new Set(visibleWeekMondays);
    const roomSet = new Set(
      filteredSessions
        .filter((s) => weekSet.has(getISOWeekMonday(s.classDate)))
        .map((s) => s.classroom),
    );
    return sortRooms([...roomSet]);
  }, [filteredSessions, visibleWeekMondays]);

  // Build grid: weekMonday → room → sessions[]
  const grid = useMemo(() => {
    const map = new Map<string, Map<string, SessionRow[]>>();
    for (const week of visibleWeekMondays) {
      map.set(week, new Map());
    }
    for (const session of filteredSessions) {
      const week = getISOWeekMonday(session.classDate);
      if (!map.has(week)) continue;
      const roomMap = map.get(week)!;
      if (!roomMap.has(session.classroom)) {
        roomMap.set(session.classroom, []);
      }
      roomMap.get(session.classroom)!.push(session);
    }
    return map;
  }, [filteredSessions, visibleWeekMondays]);

  // Pagination helpers
  const canGoPrev = anchorWeek > (allWeekMondays[0] ?? "");
  const canGoNext = (() => {
    if (!anchorWeek || allWeekMondays.length === 0) return false;
    const idx = allWeekMondays.indexOf(anchorWeek);
    return idx !== -1 && idx + WEEKS_PER_PAGE < allWeekMondays.length;
  })();

  const goPrev = () => {
    const idx = allWeekMondays.indexOf(anchorWeek);
    if (idx > 0) {
      setAnchorWeek(allWeekMondays[Math.max(0, idx - WEEKS_PER_PAGE)] ?? allWeekMondays[0] ?? anchorWeek);
    }
  };
  const goNext = () => {
    const idx = allWeekMondays.indexOf(anchorWeek);
    if (idx !== -1 && idx + WEEKS_PER_PAGE < allWeekMondays.length) {
      setAnchorWeek(allWeekMondays[idx + WEEKS_PER_PAGE] ?? anchorWeek);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-[1320px] flex-1 items-center justify-center px-4 py-8">
        <p className="text-sm text-[var(--ink-soft)]">Cargando grilla de sesiones…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col gap-4 px-4 py-6 md:px-6">
      {/* Header */}
      <header className="glass-panel fade-up p-5 md:p-6">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">Vista de gerencia</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">Grilla de sesiones</h1>
        <p className="mt-1.5 text-sm text-[var(--ink-muted)]">
          Semanas en filas · Aulas/Salas en columnas. Detecta huecos y conflictos de un vistazo.
        </p>

        {error ? (
          <p className="mt-3 rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}

        {/* Filters */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder="Buscar curso, materia o profesor…"
            className="ui-control h-8 w-64 text-xs"
          />
          <button
            type="button"
            onClick={() => setShowOnlyConflicts((v) => !v)}
            className={`rounded-full border px-3 py-1 text-[11px] transition ${
              showOnlyConflicts
                ? "border-amber-400/60 bg-amber-400/15 text-amber-300"
                : "border-white/15 bg-white/5 text-[var(--ink-soft)] hover:border-white/30"
            }`}
          >
            {showOnlyConflicts ? "✕ Solo con incidencia" : "Solo con incidencia"}
          </button>

          {/* Legend */}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {Object.entries(COURSE_CODE_COLORS).map(([code, cls]) => (
              <span key={code} className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${cls}`}>
                {code}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* Navigation */}
      <div className="glass-panel fade-up flex items-center justify-between gap-4 px-4 py-3">
        <button
          type="button"
          onClick={goPrev}
          disabled={!canGoPrev}
          className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-[var(--ink-soft)] hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Anterior
        </button>

        <p className="text-xs text-[var(--ink-soft)]">
          {visibleWeekMondays.length === 0 ? (
            "Sin sesiones"
          ) : (
            <>
              Semana del <strong className="text-[var(--foreground)]">{formatDateShort(visibleWeekMondays[0]!)}</strong>
              {" — "}
              <strong className="text-[var(--foreground)]">{formatDateShort(addWeeks(visibleWeekMondays[visibleWeekMondays.length - 1]!, 1))}</strong>
              <span className="ml-2 text-[var(--ink-muted)]">({visibleWeekMondays.length} semana{visibleWeekMondays.length !== 1 ? "s" : ""})</span>
            </>
          )}
        </p>

        <button
          type="button"
          onClick={goNext}
          disabled={!canGoNext}
          className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-[var(--ink-soft)] hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Siguiente →
        </button>
      </div>

      {/* Grid */}
      {visibleWeekMondays.length === 0 ? (
        <div className="glass-panel fade-up p-8 text-center text-sm text-[var(--ink-soft)]">
          {sessions.length === 0
            ? "No hay sesiones programadas todavía."
            : "No hay sesiones que coincidan con el filtro."}
        </div>
      ) : (
        <div className="glass-panel fade-up overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-xs">
            <thead>
              <tr>
                {/* Week column header */}
                <th className="sticky left-0 z-10 bg-[var(--surface)] px-3 py-2.5 text-left font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)] after:absolute after:right-0 after:top-0 after:h-full after:w-px after:bg-white/10">
                  Semana
                </th>
                {visibleRooms.map((room) => (
                  <th
                    key={room}
                    className="min-w-[160px] border-l border-white/8 px-3 py-2.5 text-center font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]"
                  >
                    {room}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {visibleWeekMondays.map((weekMonday) => {
                const roomMap = grid.get(weekMonday) ?? new Map<string, SessionRow[]>();
                const sundayDate = addWeeks(weekMonday, 1);
                // all sessions in this week across all rooms
                const weekSessions = [...roomMap.values()].flat();
                const hasAnyConflict = weekSessions.some((s) => s.hasTitularIncidenceConflict && !s.isCovered);

                return (
                  <tr key={weekMonday} className="border-t border-white/8 hover:bg-white/[0.015]">
                    {/* Week label */}
                    <td className="sticky left-0 z-10 bg-[var(--surface)] px-3 py-2 align-top after:absolute after:right-0 after:top-0 after:h-full after:w-px after:bg-white/10">
                      <p className="font-medium text-[var(--foreground)]">{formatDateShort(weekMonday)}</p>
                      <p className="text-[10px] text-[var(--ink-muted)]">
                        al {formatDateShort(addWeeks(weekMonday, 1))}
                      </p>
                      {hasAnyConflict && (
                        <span className="mt-1 inline-block rounded-full border border-amber-400/40 bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">
                          ⚠ incidencia
                        </span>
                      )}
                    </td>

                    {/* Room cells */}
                    {visibleRooms.map((room) => {
                      const cellSessions = roomMap.get(room) ?? [];

                      if (cellSessions.length === 0) {
                        return (
                          <td
                            key={room}
                            className="border-l border-white/8 px-2 py-2 align-top text-center"
                          >
                            <span className="text-[10px] text-white/15">—</span>
                          </td>
                        );
                      }

                      return (
                        <td
                          key={room}
                          className="border-l border-white/8 px-2 py-2 align-top"
                        >
                          <div className="flex flex-col gap-1.5">
                            {cellSessions.map((session) => (
                              <div
                                key={session.id}
                                className={`rounded-lg border px-2 py-1.5 ${courseColor(session.courseCode)} ${
                                  session.hasTitularIncidenceConflict && !session.isCovered
                                    ? "ring-1 ring-amber-400/50"
                                    : ""
                                }`}
                              >
                                <p className="font-semibold leading-tight">{session.courseName}</p>
                                <p className="mt-0.5 text-[10px] opacity-80">{session.subjectName}</p>
                                <p className="mt-0.5 text-[10px] opacity-70">
                                  {session.startTime.slice(0, 5)}–{session.endTime.slice(0, 5)}
                                </p>
                                <p className="mt-0.5 text-[10px] opacity-80">
                                  {session.isCovered ? (
                                    <>
                                      <span className="opacity-50 line-through">{session.teacherName}</span>
                                      {" → "}
                                      <span>{session.effectiveTeacherName}</span>
                                    </>
                                  ) : (
                                    <>{session.effectiveTeacherName ?? session.teacherName}</>
                                  )}
                                </p>
                                <p className="mt-0.5 text-[10px] opacity-60">
                                  {formatDateLong(session.classDate)}
                                </p>
                                {session.hasTitularIncidenceConflict && !session.isCovered && (
                                  <p className="mt-1 rounded border border-amber-400/40 bg-amber-400/10 px-1 py-0.5 text-[9px] text-amber-300">
                                    ⚠ {session.incidenceReason ? session.incidenceReason : "Sin cobertura"}
                                  </p>
                                )}
                                {session.isCovered && (
                                  <p className="mt-1 rounded border border-emerald-400/40 bg-emerald-400/10 px-1 py-0.5 text-[9px] text-emerald-300">
                                    ✓ Cubierta
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary footer */}
      {visibleWeekMondays.length > 0 && (
        <p className="text-center text-[11px] text-[var(--ink-muted)]">
          {filteredSessions.length} sesión{filteredSessions.length !== 1 ? "es" : ""} en total ·{" "}
          {visibleRooms.length} aula{visibleRooms.length !== 1 ? "s" : ""} en este rango
        </p>
      )}
    </div>
  );
}
