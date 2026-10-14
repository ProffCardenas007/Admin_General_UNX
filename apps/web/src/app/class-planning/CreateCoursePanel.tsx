"use client";

import { useMemo, useState } from "react";
import axios from "axios";
import { API_URL, authHeaders } from "../../lib/api";
import { planningErrorMessage } from "./errors";
import {
  CLASSROOM_OPTIONS,
  CLASS_TYPE_OPTIONS,
  getClassroomOptions,
  getTimeBlocksByModality,
} from "./planning";
import type { Modality, PlanningNotify } from "./types";

export default function CreateCoursePanel({
  notify,
  reload,
}: {
  notify: PlanningNotify;
  reload: () => Promise<void>;
}) {
  const [courseCode, setCourseCode] = useState<(typeof CLASS_TYPE_OPTIONS)[number]>("Curso");
  const [courseSectionCode, setCourseSectionCode] = useState("");
  const [courseName, setCourseName] = useState("");
  const [courseModality, setCourseModalityState] = useState<Modality>("presencial");
  const [courseClassroom, setCourseClassroom] = useState(CLASSROOM_OPTIONS[0]);
  const [courseTimeBlock, setCourseTimeBlock] = useState("08:00-10:30");
  const [courseTermStart, setCourseTermStart] = useState("");
  const [courseTermEnd, setCourseTermEnd] = useState("");

  const courseTimeBlocks = useMemo(
    () => getTimeBlocksByModality(courseModality),
    [courseModality],
  );

  // Switching modality may invalidate the chosen time block and room, so they
  // are re-validated at the moment the modality changes.
  const setCourseModality = (modality: Modality) => {
    setCourseModalityState(modality);

    const availableTimeBlocks = getTimeBlocksByModality(modality);
    const firstBlock = availableTimeBlocks[0];

    setCourseTimeBlock((current) => {
      if (availableTimeBlocks.some((block) => `${block.startTime}-${block.endTime}` === current)) {
        return current;
      }

      return firstBlock ? `${firstBlock.startTime}-${firstBlock.endTime}` : "08:00-10:30";
    });

    setCourseClassroom((current) => {
      const options = getClassroomOptions(modality);
      if (options.includes(current)) return current;
      return options[0] ?? CLASSROOM_OPTIONS[0];
    });
  };

  const onCreateCourse = async () => {
    notify.clear();

    if (!courseName.trim()) {
      notify.error("Completa nombre del curso.");
      return;
    }

    if (!courseSectionCode.trim()) {
      notify.error("Completa el codigo del curso.");
      return;
    }

    const [courseStartTime, courseEndTime] = courseTimeBlock.split("-");
    if (!courseStartTime || !courseEndTime) {
      notify.error("Selecciona un horario valido para el curso.");
      return;
    }

    if (courseTermStart && courseTermEnd && courseTermStart > courseTermEnd) {
      notify.error("La fecha de fin de vigencia debe ser mayor a la de inicio.");
      return;
    }

    try {
      await axios.post(
        `${API_URL}/class-planning/courses`,
        {
          code: courseCode.trim().toUpperCase(),
          sectionCode: courseSectionCode.trim().toUpperCase(),
          name: courseName.trim(),
          modality: courseModality,
          classroom: courseClassroom,
          startTime: courseStartTime,
          endTime: courseEndTime,
          termStartDate: courseTermStart || undefined,
          termEndDate: courseTermEnd || undefined,
        },
        { headers: authHeaders() },
      );

      setCourseCode("Curso");
      setCourseSectionCode("");
      setCourseName("");
      setCourseModality("presencial");
      setCourseClassroom(getClassroomOptions("presencial")[0] ?? CLASSROOM_OPTIONS[0]);
      setCourseTimeBlock("08:00-10:30");
      setCourseTermStart("");
      setCourseTermEnd("");
      notify.info("Curso creado correctamente.");
      await reload();
    } catch (error) {
      notify.error(
        planningErrorMessage(
          error,
          "No se pudo crear el curso. Verifica que el nombre no esté duplicado.",
          "No tienes permisos de gerencia para crear cursos.",
        ),
      );
    }
  };

  return (
        <div className="glass-panel fade-up p-4 md:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">Crear curso</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
              Tipo de clase
              <select
                value={courseCode}
                onChange={(event) => setCourseCode(event.target.value as (typeof CLASS_TYPE_OPTIONS)[number])}
                className="ui-control"
              >
                {CLASS_TYPE_OPTIONS.map((classType) => (
                  <option key={classType} value={classType}>
                    {classType}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
              Modalidad
              <select
                value={courseModality}
                onChange={(event) => setCourseModality(event.target.value as "presencial" | "virtual")}
                className="ui-control"
              >
                <option value="presencial">Presencial</option>
                <option value="virtual">Virtual</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
              Nombre
              <input
                type="text"
                value={courseName}
                onChange={(event) => setCourseName(event.target.value)}
                placeholder="Curso Integral A"
                className="ui-control"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
              Código
              <input
                type="text"
                value={courseSectionCode}
                onChange={(event) => setCourseSectionCode(event.target.value)}
                placeholder="1A"
                className="ui-control"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
              {courseModality === "virtual" ? "Sala virtual" : "Aula base"}
              <select
                value={courseClassroom}
                onChange={(event) => setCourseClassroom(event.target.value)}
                className="ui-control"
              >
                {getClassroomOptions(courseModality).map((room) => (
                  <option key={room} value={room}>
                    {room}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)] sm:col-span-2">
              Horario del curso
              <select
                value={courseTimeBlock}
                onChange={(event) => setCourseTimeBlock(event.target.value)}
                className="ui-control"
              >
                {courseTimeBlocks.map((timeBlock) => (
                  <option
                    key={`${timeBlock.startTime}-${timeBlock.endTime}`}
                    value={`${timeBlock.startTime}-${timeBlock.endTime}`}
                  >
                    {timeBlock.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
              Inicio de vigencia (opcional)
              <input
                type="date"
                value={courseTermStart}
                onChange={(event) => setCourseTermStart(event.target.value)}
                className="ui-control"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--ink-soft)]">
              Fin de vigencia (opcional)
              <input
                type="date"
                value={courseTermEnd}
                onChange={(event) => setCourseTermEnd(event.target.value)}
                className="ui-control"
              />
            </label>
          </div>
          <p className="mt-2 rounded-lg border border-white/12 bg-white/[0.03] px-2.5 py-2 text-[11px] text-[var(--ink-soft)]">
            Horarios permitidos: 8:30 am - 10:30 am, 11:00 am - 1:30 pm, 4:00 pm - 6:30 pm.
            Para modalidad virtual tambien: 7:00 pm - 10:30 pm.
            Sin vigencia definida, el aula/horario del curso queda reservada indefinidamente.
          </p>
          <button type="button" onClick={onCreateCourse} className="ui-btn ui-btn-primary mt-3 h-9 px-4 text-sm">
            Crear curso
          </button>
        </div>
  );
}
