"use client";

import { useMemo, useState } from "react";
import axios from "axios";
import { API_URL, authHeaders } from "../../lib/api";
import { planningErrorMessage } from "./errors";
import { getTeachersForSubject as teachersForSubject, isCourseTypePAA, resolveCourseId } from "./planning";
import type { CourseRow, PlanningNotify, UserRow } from "./types";

export default function AssignGroupPanel({
  unprogrammedCourses,
  teachers,
  notify,
  reload,
}: {
  unprogrammedCourses: CourseRow[];
  teachers: UserRow[];
  notify: PlanningNotify;
  reload: () => Promise<void>;
}) {
  // null = nothing picked yet, so the first unscheduled course is used.
  const [pickedCourseId, setPickedCourseId] = useState<string | null>(null);
  const [spanishTeacherId, setSpanishTeacherId] = useState("");
  const [mathTeacherId, setMathTeacherId] = useState("");
  // Single-subject mode (Regularización / Asesorías / Examen)
  const [singleSubjectName, setSingleSubjectName] = useState("Materia");
  const [singleTeacherId, setSingleTeacherId] = useState("");

  const selectedCourseId = resolveCourseId(pickedCourseId, unprogrammedCourses);
  const selectedCourse = useMemo(
    () => unprogrammedCourses.find((course) => course.id === selectedCourseId),
    [unprogrammedCourses, selectedCourseId],
  );

  const getTeachersForSubject = (subjectName: string, currentTeacherId?: string | null) =>
    teachersForSubject(teachers, subjectName, currentTeacherId);

  // Prefill the teachers already saved on the selected course. Runs while
  // rendering (React's "adjust state when a value changes" pattern) each time
  // the selected course changes, including when fresh data arrives after a save.
  const [prefilledFor, setPrefilledFor] = useState<CourseRow | undefined>(undefined);
  if (selectedCourse !== prefilledFor) {
    setPrefilledFor(selectedCourse);

    if (!selectedCourse) {
      setSpanishTeacherId("");
      setMathTeacherId("");
      setSingleTeacherId("");
    } else if (isCourseTypePAA(selectedCourse.code)) {
      const spanishSubject = selectedCourse.subjects.find((subject) => subject.name === "Español");
      const mathSubject = selectedCourse.subjects.find((subject) => subject.name === "Matemáticas");
      setSpanishTeacherId(spanishSubject?.teacherUserId ?? "");
      setMathTeacherId(mathSubject?.teacherUserId ?? "");
    } else {
      const subject = selectedCourse.subjects[0];
      setSingleSubjectName(subject?.name ?? selectedCourse.code);
      setSingleTeacherId(subject?.teacherUserId ?? "");
    }
  }

  const onCreateSubject = async () => {
    notify.clear();

    if (!selectedCourseId) {
      notify.error("Selecciona un curso.");
      return;
    }

    const isPAA = isCourseTypePAA(selectedCourse?.code ?? "");

    if (isPAA) {
      if (!spanishTeacherId || !mathTeacherId) {
        notify.error("Selecciona profesor para Español y Matemáticas.");
        return;
      }
    } else {
      if (!singleSubjectName.trim()) {
        notify.error("Escribe el nombre de la materia.");
        return;
      }
      if (!singleTeacherId) {
        notify.error("Selecciona un profesor para la materia.");
        return;
      }
    }

    try {
      if (isPAA) {
        const saveSubjectWithTeacher = async (subjectName: "Español" | "Matemáticas", teacherUserId: string) => {
          const existingSubject = selectedCourse?.subjects.find((subject) => subject.name === subjectName);

          if (existingSubject) {
            await axios.patch(
              `${API_URL}/class-planning/subjects/${existingSubject.id}/teacher`,
              { teacherUserId },
              { headers: authHeaders() },
            );
            return;
          }

          await axios.post(
            `${API_URL}/class-planning/courses/${selectedCourseId}/subjects`,
            { name: subjectName, teacherUserId },
            { headers: authHeaders() },
          );
        };

        await Promise.all([
          saveSubjectWithTeacher("Español", spanishTeacherId),
          saveSubjectWithTeacher("Matemáticas", mathTeacherId),
        ]);
      } else {
        const trimmedName = singleSubjectName.trim();
        const existingSubject = selectedCourse?.subjects[0];

        if (existingSubject) {
          if (existingSubject.name !== trimmedName) {
            // name changed: create a new subject (old one stays; the course can only have 1 for non-PAA)
            await axios.post(
              `${API_URL}/class-planning/courses/${selectedCourseId}/subjects`,
              { name: trimmedName, teacherUserId: singleTeacherId },
              { headers: authHeaders() },
            );
          } else {
            await axios.patch(
              `${API_URL}/class-planning/subjects/${existingSubject.id}/teacher`,
              { teacherUserId: singleTeacherId },
              { headers: authHeaders() },
            );
          }
        } else {
          await axios.post(
            `${API_URL}/class-planning/courses/${selectedCourseId}/subjects`,
            { name: trimmedName, teacherUserId: singleTeacherId },
            { headers: authHeaders() },
          );
        }
      }

      notify.info("Materias y profesores guardados correctamente.");
      await reload();
    } catch (error) {
      notify.error(
        planningErrorMessage(
          error,
          "No se pudieron guardar las materias y profesores.",
          "No tienes permisos de gerencia para asignar profesores.",
        ),
      );
    }
  };

  return (
        <div className="glass-panel fade-up p-4 md:p-5" style={{ animationDelay: "80ms" }}>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">Asignación de grupo</p>
          <div className="mt-2 grid gap-3">
            <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)] sm:col-span-2">
              Curso
              <select
                value={selectedCourseId}
                onChange={(event) => setPickedCourseId(event.target.value)}
                disabled={unprogrammedCourses.length === 0}
                className="ui-control"
              >
                {unprogrammedCourses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name} · {course.sectionCode || "Sin código"}
                  </option>
                ))}
              </select>
            </label>

            {unprogrammedCourses.length === 0 ? (
              <p className="rounded-lg border border-white/12 bg-white/[0.03] px-3 py-2 text-xs text-[var(--ink-soft)]">
                No hay cursos pendientes por programar.
              </p>
            ) : null}

            {selectedCourse && isCourseTypePAA(selectedCourse.code) ? (
              <>
                <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                  <p className="text-sm font-medium text-[var(--foreground)]">Español</p>
                  <label className="mt-1.5 flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
                    Profesor de Español
                    <select
                      value={spanishTeacherId}
                      onChange={(event) => setSpanishTeacherId(event.target.value)}
                      className="ui-control"
                    >
                      <option value="">Sin asignar</option>
                      {getTeachersForSubject("Español", spanishTeacherId).map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>
                          {teacher.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                  <p className="text-sm font-medium text-[var(--foreground)]">Matemáticas</p>
                  <label className="mt-1.5 flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
                    Profesor de Matemáticas
                    <select
                      value={mathTeacherId}
                      onChange={(event) => setMathTeacherId(event.target.value)}
                      className="ui-control"
                    >
                      <option value="">Sin asignar</option>
                      {getTeachersForSubject("Matemáticas", mathTeacherId).map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>
                          {teacher.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            ) : selectedCourse ? (
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                <p className="text-sm font-medium text-[var(--foreground)]">{selectedCourse.code}</p>
                <label className="mt-1.5 flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
                  Nombre de la materia
                  <input
                    type="text"
                    value={singleSubjectName}
                    onChange={(event) => setSingleSubjectName(event.target.value)}
                    placeholder="Ej: Álgebra, Redacción…"
                    className="ui-control"
                  />
                </label>
                <label className="mt-2 flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
                  Profesor
                  <select
                    value={singleTeacherId}
                    onChange={(event) => setSingleTeacherId(event.target.value)}
                    className="ui-control"
                  >
                    <option value="">Sin asignar</option>
                    {getTeachersForSubject(singleSubjectName.trim(), singleTeacherId).map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.fullName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onCreateSubject}
            disabled={!selectedCourseId || unprogrammedCourses.length === 0}
            className="ui-btn ui-btn-primary mt-3 h-9 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            Guardar asignación
          </button>
        </div>
  );
}
