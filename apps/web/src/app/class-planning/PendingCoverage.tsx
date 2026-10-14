"use client";

import { useMemo, useState } from "react";
import axios from "axios";
import { API_URL, authHeaders } from "../../lib/api";
import { planningErrorMessage } from "./errors";
import { pendingCoverageSessions } from "./planning";
import type { PlanningNotify, SessionRow, UserRow } from "./types";

export default function PendingCoverage({
  sessions,
  teachers,
  notify,
  reload,
}: {
  sessions: SessionRow[];
  teachers: UserRow[];
  notify: PlanningNotify;
  reload: () => Promise<void>;
}) {
  const visibleSessions = useMemo(() => pendingCoverageSessions(sessions), [sessions]);
  const pendingCoverageCount = visibleSessions.length;

  // Covers already saved on each session, overridden by what the user picked here.
  const [pickedCoverage, setPickedCoverage] = useState<Record<string, string>>({});
  const coverageBySession = useMemo(
    () => ({
      ...Object.fromEntries(sessions.map((session) => [session.id, session.coverTeacherUserId ?? ""])),
      ...pickedCoverage,
    }),
    [sessions, pickedCoverage],
  );
  const setCoverageBySession = (
    updater: (current: Record<string, string>) => Record<string, string>,
  ) => setPickedCoverage(updater(coverageBySession));

  const onAssignCoverage = async (sessionId: string) => {
    notify.clear();

    try {
      const response = await axios.patch(
        `${API_URL}/class-planning/sessions/${sessionId}/coverage`,
        {
          coverTeacherUserId: coverageBySession[sessionId] || undefined,
        },
        { headers: authHeaders() },
      );

      const warning = (response.data as { coverTeacherAvailabilityWarning?: string }).coverTeacherAvailabilityWarning;
      if (warning) {
        notify.info(`Cobertura asignada. ⚠ ${warning}`);
      } else {
        notify.info("Cobertura de clase actualizada correctamente.");
      }

      setPickedCoverage({});
      await reload();
    } catch (error) {
      notify.error(
        planningErrorMessage(
          error,
          "No se pudo asignar la cobertura. Revisa choques de horario del profesor de apoyo.",
          "No tienes permisos de gerencia para asignar coberturas.",
        ),
      );
    }
  };

  const onDeleteSession = async (sessionId: string) => {
    if (!window.confirm("¿Eliminar esta sesión programada?")) return;
    notify.clear();

    try {
      await axios.delete(`${API_URL}/class-planning/sessions/${sessionId}`, { headers: authHeaders() });
      notify.info("Sesión eliminada correctamente.");
      setPickedCoverage({});
      await reload();
    } catch (error) {
      notify.error(planningErrorMessage(error, "No se pudo eliminar la sesión."));
    }
  };

  return (
        <div className="glass-panel fade-up p-4 md:p-5" style={{ animationDelay: "180ms" }}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">Coberturas pendientes</p>
          </div>
          <p className="mt-1 text-[11px] text-[var(--ink-soft)]">
            Sesiones con incidencia del profesor titular y sin suplente: {pendingCoverageCount}
          </p>
          <div className="mt-2 max-h-[420px] space-y-2 overflow-auto pr-1">
            {visibleSessions.length === 0 ? (
              <p className="text-sm text-[var(--ink-soft)]">No hay sesiones pendientes de cobertura.</p>
            ) : (
              visibleSessions.map((session) => (
                <div key={session.id} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                  <p className="text-xs font-semibold text-[var(--foreground)]">
                    {session.classDate} · {session.startTime.slice(0, 5)} - {session.endTime.slice(0, 5)}
                  </p>
                  <p className="text-xs text-[var(--ink-soft)] mt-0.5">
                    {session.courseName} · Tipo: {session.courseCode}
                  </p>
                  <p className="text-xs text-[var(--ink-soft)]">
                    {session.subjectName} · Titular: {session.teacherName}
                  </p>
                  <p className="text-xs text-[var(--ink-soft)]">
                    Modalidad: {session.courseModality ?? "presencial"} · Aula: {session.classroom}
                  </p>

                  {session.hasTitularIncidenceConflict ? (
                    <p className="mt-1 rounded-md border border-amber-300/40 bg-amber-300/10 px-2 py-1 text-[11px] text-amber-900">
                      Incidencia detectada del titular para este bloque
                      {session.incidenceReason ? ` · Motivo: ${session.incidenceReason}` : ""}
                    </p>
                  ) : null}

                  <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto_auto]">
                    <select
                      value={coverageBySession[session.id] ?? ""}
                      onChange={(event) =>
                        setCoverageBySession((current) => ({
                          ...current,
                          [session.id]: event.target.value,
                        }))
                      }
                      className="ui-control"
                    >
                      <option value="">Selecciona quién cubrirá la sesión</option>
                      {teachers
                        .filter((teacher) => teacher.id !== session.teacherUserId)
                        .map((teacher) => (
                          <option key={teacher.id} value={teacher.id}>
                            {teacher.fullName}
                          </option>
                        ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => void onAssignCoverage(session.id)}
                      className="ui-btn h-9 px-3 text-xs"
                    >
                      Guardar cobertura
                    </button>

                    <button
                      type="button"
                      onClick={() => void onDeleteSession(session.id)}
                      className="h-9 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 text-xs text-[var(--danger)] hover:border-[var(--danger)]/60"
                    >
                      Eliminar
                    </button>
                  </div>

                  <p className="mt-1 text-[11px] text-[var(--ink-soft)]">
                    Responsable actual: {session.effectiveTeacherName || session.teacherName}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
  );
}
