"use client";

import { useMemo, useState } from "react";
import axios from "axios";
import { API_URL, authHeaders } from "../../lib/api";
import { getApiErrorMessage, getApiErrorStatus } from "./errors";
import {
  isCourseTypePAA,
  planWeeklySessions,
  resolveCourseId,
  toLocalISODate,
  toTimeBlockLabel,
  type PlanSubject,
} from "./planning";
import type { CourseRow, PlanningNotify } from "./types";

export default function ScheduleClassPanel({
  unprogrammedCourses,
  notify,
  reload,
}: {
  unprogrammedCourses: CourseRow[];
  notify: PlanningNotify;
  reload: () => Promise<void>;
}) {
  // null = nothing picked yet, so the first unscheduled course is used.
  const [pickedSessionCourseId, setPickedSessionCourseId] = useState<string | null>(null);
  const [sessionDate, setSessionDate] = useState(() => toLocalISODate(new Date()));
  const [sessionDurationWeeks, setSessionDurationWeeks] = useState(14);
  const [startWithDoubleMath, setStartWithDoubleMath] = useState(false);
  const [sessionNotes, setSessionNotes] = useState("");

  const sessionCourseId = resolveCourseId(pickedSessionCourseId, unprogrammedCourses);
  const sessionCourse = useMemo(
    () => unprogrammedCourses.find((course) => course.id === sessionCourseId),
    [unprogrammedCourses, sessionCourseId],
  );

  const onCreateSession = async () => {
    notify.clear();

    if (!sessionCourseId || !sessionDate) {
      notify.error("Completa curso y fecha de inicio.");
      return;
    }

    if (sessionDurationWeeks < 1) {
      notify.error("La duración debe ser mayor o igual a 1 semana.");
      return;
    }

    if (!sessionCourse) {
      notify.error("Selecciona un curso válido.");
      return;
    }

    const isPAA = isCourseTypePAA(sessionCourse.code);

    // Subjects to alternate (PAA: [math, spanish]) or the single subject.
    let subjectsForSession: PlanSubject[];

    if (isPAA) {
      const mathSubject = sessionCourse.subjects.find((subject) => subject.name === "Matemáticas");
      const spanishSubject = sessionCourse.subjects.find((subject) => subject.name === "Español");

      if (!mathSubject?.teacherUserId || !spanishSubject?.teacherUserId) {
        notify.error("El curso debe tener asignado profesor para Matemáticas y Español.");
        return;
      }

      subjectsForSession = [mathSubject as PlanSubject, spanishSubject as PlanSubject];
    } else {
      const singleSubject = sessionCourse.subjects[0];

      if (!singleSubject?.teacherUserId) {
        notify.error("El curso debe tener asignado un profesor.");
        return;
      }

      subjectsForSession = [singleSubject as PlanSubject];
    }

    const sessionStartTime = sessionCourse.scheduleStartTime.slice(0, 5);
    const sessionEndTime = sessionCourse.scheduleEndTime.slice(0, 5);
    const sessionClassroom = sessionCourse.classroom;

    const plan = planWeeklySessions({
      startDate: sessionDate,
      weeks: sessionDurationWeeks,
      subjects: subjectsForSession,
      alternate: isPAA,
      startWithDoubleMath,
    });
    if (!plan) {
      notify.error("Fecha de inicio inválida.");
      return;
    }

    let createdSessionsCount = 0;
    let failedClassDate = "";
    const availabilityWarnings: string[] = [];

    try {
      for (const planned of plan) {
        failedClassDate = planned.classDate;

        const response = await axios.post(
          `${API_URL}/class-planning/sessions`,
          {
            courseId: sessionCourseId,
            subjectId: planned.subject.id,
            teacherUserId: planned.subject.teacherUserId,
            classDate: planned.classDate,
            startTime: sessionStartTime,
            endTime: sessionEndTime,
            classroom: sessionClassroom,
            notes: sessionNotes.trim() || undefined,
          },
          { headers: authHeaders() },
        );

        const warning = (response.data as { availabilityWarning?: string }).availabilityWarning;
        if (warning) {
          availabilityWarnings.push(`${planned.classDate}: ${warning}`);
        }

        createdSessionsCount += 1;
      }

      setSessionNotes("");

      if (availabilityWarnings.length > 0) {
        notify.info(
          `Se programaron ${sessionDurationWeeks} semanas. ⚠ Disponibilidad condicional en ${availabilityWarnings.length} sesión(es): revisa con el profesor.`,
        );
      } else {
        notify.info(`Se programaron ${sessionDurationWeeks} semanas correctamente.`);
      }

      await reload();
    } catch (error) {
      if (getApiErrorStatus(error) === 403) {
        notify.error("No tienes permisos de gerencia para programar clases.");
        return;
      }

      await reload();

      // reload() clears the message line, so report after it finishes.
      if (createdSessionsCount > 0) {
        notify.info(`Se programaron ${createdSessionsCount} semana(s) antes del conflicto.`);
        notify.error(
          getApiErrorMessage(
            error,
            `Hubo un conflicto y se detuvo la programación en ${failedClassDate}. Revisa Sesiones programadas.`,
          ),
        );
        return;
      }

      notify.error(
        getApiErrorMessage(error, "No se pudo programar el calendario. Puede existir conflicto de horario."),
      );
    }
  };

  return (
        <div className="glass-panel fade-up p-4 md:p-5" style={{ animationDelay: "150ms" }}>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">Programar clase</p>
          <div className="mt-2 space-y-3">
            <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)] sm:col-span-2">
              Curso
              <select
                value={sessionCourseId}
                onChange={(event) => setPickedSessionCourseId(event.target.value)}
                disabled={unprogrammedCourses.length === 0}
                className="ui-control"
              >
                {unprogrammedCourses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name} · Código: {course.sectionCode || "Sin código"} · Tipo: {course.code} · {course.modality} · {toTimeBlockLabel(course.scheduleStartTime, course.scheduleEndTime)}
                  </option>
                ))}
              </select>
            </label>

            {unprogrammedCourses.length === 0 ? (
              <p className="rounded-lg border border-white/12 bg-white/[0.03] px-2.5 py-2 text-[11px] text-[var(--ink-soft)]">
                Todos los cursos ya fueron programados y se muestran en Sesiones programadas.
              </p>
            ) : null}

            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">Lista de detalles</p>

            <div className="rounded-lg border border-white/12 bg-white/[0.03] px-3 py-2 text-sm text-[var(--foreground)]">
              {sessionCourse && isCourseTypePAA(sessionCourse.code) ? (
                <>
                  <p>
                    Profesor de Matemáticas: {sessionCourse.subjects.find((s) => s.name === "Matemáticas")?.teacherName || "Sin asignar"}
                  </p>
                  <p className="mt-1">
                    Profesor de Español: {sessionCourse.subjects.find((s) => s.name === "Español")?.teacherName || "Sin asignar"}
                  </p>
                </>
              ) : sessionCourse?.subjects[0] ? (
                <p>
                  {sessionCourse.subjects[0].name}: {sessionCourse.subjects[0].teacherName || "Sin asignar"}
                </p>
              ) : (
                <p className="text-[var(--ink-soft)]">Sin materia asignada</p>
              )}
              <p className="mt-1 text-xs text-[var(--ink-soft)]">
                Horario: {sessionCourse ? toTimeBlockLabel(sessionCourse.scheduleStartTime, sessionCourse.scheduleEndTime) : "Sin definir"}
              </p>
              <p className="text-xs text-[var(--ink-soft)]">
                Aula: {sessionCourse?.classroom || "Sin definir"}
              </p>
            </div>

            <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
              Fecha
              <input
                type="date"
                value={sessionDate}
                onChange={(event) => setSessionDate(event.target.value)}
                className="ui-control"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
              Duración (semanas)
              <input
                type="number"
                min={1}
                max={52}
                value={sessionDurationWeeks}
                onChange={(event) => setSessionDurationWeeks(Number(event.target.value || 1))}
                className="ui-control"
              />
            </label>

            {sessionCourse && isCourseTypePAA(sessionCourse.code) ? (
              <>
                <button
                  type="button"
                  onClick={() => setStartWithDoubleMath((current) => !current)}
                  className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-left text-sm text-[var(--foreground)] hover:border-white/30"
                >
                  {startWithDoubleMath
                    ? "Patrón: 2 semanas de Matemáticas y luego alterna"
                    : "Patrón: alternancia semanal Matemáticas/Español"}
                </button>
                <p className="rounded-lg border border-white/12 bg-white/[0.03] px-2.5 py-2 text-[11px] text-[var(--ink-soft)]">
                  El sistema programará una sesión por semana alternando Matemáticas y Español con el horario y aula del curso.
                </p>
              </>
            ) : (
              <p className="rounded-lg border border-white/12 bg-white/[0.03] px-2.5 py-2 text-[11px] text-[var(--ink-soft)]">
                El sistema programará una sesión por semana con la misma materia y profesor en todas las fechas.
              </p>
            )}

            <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
              Notas (opcional)
              <input
                type="text"
                value={sessionNotes}
                onChange={(event) => setSessionNotes(event.target.value)}
                className="ui-control"
                placeholder="Observaciones"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={onCreateSession}
            disabled={!sessionCourseId || unprogrammedCourses.length === 0}
            className="ui-btn ui-btn-primary mt-3 h-9 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            Programar clase
          </button>
        </div>
  );
}
