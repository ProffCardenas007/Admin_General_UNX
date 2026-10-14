"use client";

import { useMemo, useState } from "react";
import axios from "axios";
import { API_URL, authHeaders } from "../../lib/api";
import { planningErrorMessage } from "./errors";
import {
  CLASSROOM_OPTIONS,
  filterCoursesByText,
  getClassroomOptions,
  getTeachersForSubject as teachersForSubject,
  getTimeBlocksByModality,
  toTimeBlockLabel,
} from "./planning";
import type { CourseRow, Modality, PlanningNotify, UserRow } from "./types";

export default function CourseList({
  courses,
  scheduledCourseIds,
  unprogrammedCount,
  teachers,
  notify,
  reload,
}: {
  courses: CourseRow[];
  scheduledCourseIds: Set<string>;
  unprogrammedCount: number;
  teachers: UserRow[];
  notify: PlanningNotify;
  reload: () => Promise<void>;
}) {
  const [courseNameFilter, setCourseNameFilter] = useState("");
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSectionCode, setEditSectionCode] = useState("");
  const [editClassroom, setEditClassroom] = useState(CLASSROOM_OPTIONS[0]);
  const [editModality, setEditModality] = useState<Modality>("presencial");
  const [editTimeBlock, setEditTimeBlock] = useState("08:00-10:30");
  const [editTermStart, setEditTermStart] = useState("");
  const [editTermEnd, setEditTermEnd] = useState("");

  const getTeachersForSubject = (subjectName: string, currentTeacherId?: string | null) =>
    teachersForSubject(teachers, subjectName, currentTeacherId);

  const filteredCourses = useMemo(
    () => filterCoursesByText(courses, courseNameFilter),
    [courses, courseNameFilter],
  );
  const editTimeBlocks = useMemo(() => getTimeBlocksByModality(editModality), [editModality]);

  const startEditCourse = (course: CourseRow) => {
    setEditingCourseId(course.id);
    setEditName(course.name);
    setEditSectionCode(course.sectionCode ?? "");
    setEditClassroom(course.classroom);
    setEditModality(course.modality);
    setEditTimeBlock(`${course.scheduleStartTime.slice(0, 5)}-${course.scheduleEndTime.slice(0, 5)}`);
    setEditTermStart(course.termStartDate ?? "");
    setEditTermEnd(course.termEndDate ?? "");
  };

  const onAssignTeacher = async (subjectId: string, teacherUserId: string) => {
    notify.clear();

    if (!teacherUserId) {
      return;
    }

    try {
      await axios.patch(
        `${API_URL}/class-planning/subjects/${subjectId}/teacher`,
        { teacherUserId },
        { headers: authHeaders() },
      );

      notify.info("Profesor asignado correctamente.");
      await reload();
    } catch (error) {
      notify.error(
        planningErrorMessage(
          error,
          "No se pudo asignar el profesor a la materia.",
          "No tienes permisos de gerencia para asignar profesores.",
        ),
      );
    }
  };

  const onUpdateCourse = async (courseId: string) => {
    notify.clear();

    const [startTime, endTime] = editTimeBlock.split("-");
    if (!startTime || !endTime) {
      notify.error("Selecciona un horario válido.");
      return;
    }

    if (editTermStart && editTermEnd && editTermStart > editTermEnd) {
      notify.error("La fecha de fin de vigencia debe ser mayor a la de inicio.");
      return;
    }

    try {
      await axios.patch(
        `${API_URL}/class-planning/courses/${courseId}`,
        {
          name: editName.trim() || undefined,
          sectionCode: editSectionCode.trim() || undefined,
          classroom: editClassroom,
          modality: editModality,
          startTime,
          endTime,
          termStartDate: editTermStart || null,
          termEndDate: editTermEnd || null,
        },
        { headers: authHeaders() },
      );

      setEditingCourseId(null);
      notify.info("Curso actualizado correctamente.");
      await reload();
    } catch (error) {
      notify.error(planningErrorMessage(error, "No se pudo actualizar el curso."));
    }
  };

  const onToggleCourseActive = async (course: CourseRow) => {
    notify.clear();

    try {
      await axios.patch(
        `${API_URL}/class-planning/courses/${course.id}`,
        { isActive: !course.isActive },
        { headers: authHeaders() },
      );

      notify.info(`Curso ${course.isActive ? "desactivado" : "activado"} correctamente.`);
      await reload();
    } catch (error) {
      notify.error(planningErrorMessage(error, "No se pudo cambiar el estado del curso."));
    }
  };

  const onDeleteCourse = async (courseId: string) => {
    if (!window.confirm("¿Eliminar este curso? Esta acción no se puede deshacer.")) return;
    notify.clear();

    try {
      await axios.delete(`${API_URL}/class-planning/courses/${courseId}`, { headers: authHeaders() });
      notify.info("Curso eliminado correctamente.");
      await reload();
    } catch (error) {
      notify.error(
        planningErrorMessage(error, "No se pudo eliminar el curso. Elimina primero sus sesiones programadas."),
      );
    }
  };

  return (
      <section className="glass-panel fade-up p-4 md:p-5" style={{ animationDelay: "120ms" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">Asignación por curso</p>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">Revisa cada curso, edita sus datos y asigna profesor por materia.</p>
          </div>
          <span className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[11px] text-[var(--ink-soft)]">
            {courses.length} curso{courses.length === 1 ? "" : "s"} · {unprogrammedCount} sin programar
          </span>
        </div>

        <input
          type="text"
          value={courseNameFilter}
          onChange={(event) => setCourseNameFilter(event.target.value)}
          placeholder="Buscar por nombre o código…"
          className="ui-control mt-3 w-full"
        />

        <div className="mt-3 space-y-3">
          {filteredCourses.length === 0 ? (
            <p className="text-sm text-[var(--ink-soft)]">No se encontraron cursos.</p>
          ) : (
            filteredCourses.map((course) => {
              const isProgrammed = scheduledCourseIds.has(course.id);
              const isEditing = editingCourseId === course.id;

              return (
                <div
                  key={course.id}
                  className={`rounded-2xl border p-3 shadow-[0_12px_40px_rgba(0,0,0,0.08)] ${
                    course.isActive
                      ? "border-white/12 bg-gradient-to-br from-white/[0.05] to-white/[0.02]"
                      : "border-white/8 bg-white/[0.02] opacity-60"
                  }`}
                >
                  <div className="flex flex-col gap-2 border-b border-white/8 pb-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--foreground)]">{course.name}</p>
                      <p className="mt-0.5 text-xs text-[var(--ink-soft)]">
                        Código: {course.sectionCode || "Sin código"} · Tipo: {course.code} · Modalidad: {course.modality}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--ink-soft)]">
                        {course.modality === "virtual" ? "Sala virtual" : "Aula base"}: {course.classroom} · Horario base: {toTimeBlockLabel(course.scheduleStartTime, course.scheduleEndTime)}
                        {(course.termStartDate || course.termEndDate) && (
                          <> · Vigencia: {course.termStartDate ?? "…"} a {course.termEndDate ?? "…"}</>
                        )}
                        {isProgrammed && (
                          <span className="ml-2 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] text-[var(--accent)]">
                            Programado
                          </span>
                        )}
                        {!course.isActive && (
                          <span className="ml-2 rounded-full border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-2 py-0.5 text-[10px] text-[var(--danger)]">
                            Inactivo
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <span className="rounded-full border border-[var(--accent)]/20 bg-[var(--accent)]/10 px-3 py-1 text-[11px] font-medium text-[var(--accent)]">
                        {course.subjects.length} materia{course.subjects.length === 1 ? "" : "s"}
                      </span>
                      <button
                        type="button"
                        onClick={() => (isEditing ? setEditingCourseId(null) : startEditCourse(course))}
                        className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-[var(--ink-soft)] hover:border-white/30"
                      >
                        {isEditing ? "Cancelar" : "Editar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void onToggleCourseActive(course)}
                        className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-[var(--ink-soft)] hover:border-white/30"
                      >
                        {course.isActive ? "Desactivar" : "Activar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDeleteCourse(course.id)}
                        className="rounded-full border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 py-1 text-[11px] text-[var(--danger)] hover:border-[var(--danger)]/60"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>

                  {isEditing && (
                    <div className="mt-3 grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:grid-cols-2">
                      <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
                        Nombre
                        <input
                          type="text"
                          value={editName}
                          onChange={(event) => setEditName(event.target.value)}
                          className="ui-control"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
                        Código
                        <input
                          type="text"
                          value={editSectionCode}
                          onChange={(event) => setEditSectionCode(event.target.value)}
                          className="ui-control"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
                        Modalidad
                        <select
                          value={editModality}
                          onChange={(event) => {
                            const mod = event.target.value as "presencial" | "virtual";
                            setEditModality(mod);
                            const blocks = getTimeBlocksByModality(mod);
                            const first = blocks[0];
                            if (first && !blocks.some((b) => `${b.startTime}-${b.endTime}` === editTimeBlock)) {
                              setEditTimeBlock(`${first.startTime}-${first.endTime}`);
                            }
                            setEditClassroom((current) => {
                              const opts = getClassroomOptions(mod);
                              return opts.includes(current) ? current : (opts[0] ?? CLASSROOM_OPTIONS[0]);
                            });
                          }}
                          className="ui-control"
                        >
                          <option value="presencial">Presencial</option>
                          <option value="virtual">Virtual</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
                        {editModality === "virtual" ? "Sala virtual" : "Aula base"}
                        <select
                          value={editClassroom}
                          onChange={(event) => setEditClassroom(event.target.value)}
                          className="ui-control"
                        >
                          {getClassroomOptions(editModality).map((room) => (
                            <option key={room} value={room}>
                              {room}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)] sm:col-span-2">
                        Horario base
                        <select
                          value={editTimeBlock}
                          onChange={(event) => setEditTimeBlock(event.target.value)}
                          className="ui-control"
                        >
                          {editTimeBlocks.map((block) => (
                            <option key={`${block.startTime}-${block.endTime}`} value={`${block.startTime}-${block.endTime}`}>
                              {block.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
                        Inicio de vigencia (opcional)
                        <input
                          type="date"
                          value={editTermStart}
                          onChange={(event) => setEditTermStart(event.target.value)}
                          className="ui-control"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
                        Fin de vigencia (opcional)
                        <input
                          type="date"
                          value={editTermEnd}
                          onChange={(event) => setEditTermEnd(event.target.value)}
                          className="ui-control"
                        />
                      </label>
                      <div className="sm:col-span-2">
                        <button
                          type="button"
                          onClick={() => void onUpdateCourse(course.id)}
                          className="ui-btn ui-btn-primary h-9 px-4 text-sm"
                        >
                          Guardar cambios
                        </button>
                      </div>
                    </div>
                  )}

                  {!isProgrammed && !isEditing && (
                    <div className="mt-3 space-y-2">
                      {course.subjects.length === 0 ? (
                        <p className="text-xs text-[var(--ink-soft)]">Sin materias registradas.</p>
                      ) : (
                        course.subjects.map((subject) => (
                          <div
                            key={subject.id}
                            className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 md:grid-cols-[minmax(0,1fr)_280px] md:items-center"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-[var(--foreground)]">{subject.name}</p>
                              <p className="mt-1 text-[11px] text-[var(--ink-soft)]">
                                Profesor actual: {subject.teacherName || "Sin asignar"}
                              </p>
                            </div>
                            <div className="md:justify-self-end">
                              <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                                Profesor asignado
                              </label>
                              <select
                                value={subject.teacherUserId ?? ""}
                                onChange={(event) => void onAssignTeacher(subject.id, event.target.value)}
                                className="ui-control md:w-[280px]"
                              >
                                <option value="">Sin asignar</option>
                                {getTeachersForSubject(subject.name, subject.teacherUserId).map((teacher) => (
                                  <option key={teacher.id} value={teacher.id}>
                                    {teacher.fullName}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {isProgrammed && !isEditing && course.subjects.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {course.subjects.map((subject) => (
                        <p key={subject.id} className="text-[11px] text-[var(--ink-soft)]">
                          {subject.name}: {subject.teacherName || "Sin asignar"}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
  );
}
