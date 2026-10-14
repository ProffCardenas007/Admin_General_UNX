"use client";

import { useState } from "react";
import axios from "axios";
import { API_URL, authHeaders } from "../../lib/api";
import AssignGroupPanel from "./AssignGroupPanel";
import CourseList from "./CourseList";
import CreateCoursePanel from "./CreateCoursePanel";
import ImportPanel from "./ImportPanel";
import PendingCoverage from "./PendingCoverage";
import ScheduleClassPanel from "./ScheduleClassPanel";
import { planningErrorMessage } from "./errors";
import { usePlanningData } from "./usePlanningData";

export default function ClassPlanningPage() {
  const {
    loading,
    error,
    info,
    notify,
    reload,
    courses,
    sessions,
    teachers,
    unprogrammedCourses,
    scheduledCourseIds,
  } = usePlanningData();
  const [resettingPlanning, setResettingPlanning] = useState(false);

  const onResetPlanning = async () => {
    const confirmed = window.confirm(
      "¿Reiniciar toda la programación? Se eliminarán cursos, materias asignadas y sesiones. Los usuarios y sus disponibilidades se conservarán.",
    );
    if (!confirmed) return;

    notify.clear();
    setResettingPlanning(true);

    try {
      const response = await axios.delete<{
        deletedCourses: number;
        deletedSubjects: number;
        deletedSessions: number;
      }>(`${API_URL}/class-planning/reset`, { headers: authHeaders() });

      notify.info(
        `Programación reiniciada: ${response.data.deletedCourses} cursos, ${response.data.deletedSubjects} materias y ${response.data.deletedSessions} sesiones eliminadas.`,
      );
      await reload();
    } catch (error) {
      notify.error(
        planningErrorMessage(
          error,
          "No se pudo reiniciar la programación.",
          "No tienes permisos de gerencia para reiniciar la programación.",
        ),
      );
    } finally {
      setResettingPlanning(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-[1320px] flex-1 items-center justify-center px-4 py-8 md:px-6">
        <p className="text-sm text-[var(--ink-soft)]">Cargando programación académica...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col gap-4 px-4 py-6 md:px-6">
      <header className="glass-panel fade-up p-5 md:p-6">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">Vista de gerencia</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">Cursos y programación de clases</h1>
        <p className="mt-1.5 text-sm text-[var(--ink-muted)]">
          Crea cursos, asigna profesores por materia y programa sesiones de clase.
        </p>

        <button
          type="button"
          onClick={() => void onResetPlanning()}
          disabled={resettingPlanning || courses.length === 0}
          className="mt-4 h-9 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 text-sm text-[var(--danger)] hover:border-[var(--danger)]/60 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resettingPlanning ? "Reiniciando..." : "Reiniciar programación"}
        </button>

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

      <ImportPanel notify={notify} reload={reload} />

      <section className="grid gap-4 lg:grid-cols-2">
        <CreateCoursePanel notify={notify} reload={reload} />
        <AssignGroupPanel
          unprogrammedCourses={unprogrammedCourses}
          teachers={teachers}
          notify={notify}
          reload={reload}
        />
      </section>

      <CourseList
        courses={courses}
        scheduledCourseIds={scheduledCourseIds}
        unprogrammedCount={unprogrammedCourses.length}
        teachers={teachers}
        notify={notify}
        reload={reload}
      />

      <section className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <ScheduleClassPanel unprogrammedCourses={unprogrammedCourses} notify={notify} reload={reload} />
        <PendingCoverage sessions={sessions} teachers={teachers} notify={notify} reload={reload} />
      </section>
    </div>
  );
}
