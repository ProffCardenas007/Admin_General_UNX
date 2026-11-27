"use client";

import { useMemo, useState, type ReactNode } from "react";

const WEEK_DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;

export type AssignedClassRow = {
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
  classroom?: string;
  notes?: string | null;
};

const DAY_IN_MS = 86_400_000;
const EVENT_STYLES = [
  "border-cyan-300/35 bg-cyan-300/10",
  "border-emerald-300/35 bg-emerald-300/10",
  "border-amber-300/35 bg-amber-300/10",
  "border-rose-300/35 bg-rose-300/10",
];

function dateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function dateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_IN_MS);
}

function mondayKey(value: string) {
  const date = dateFromKey(value);
  const dayOffset = (date.getDay() + 6) % 7;
  return dateKey(addDays(date, -dayOffset));
}

function formatCalendarDate(value: Date) {
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(value);
}

function eventStyle(value: string) {
  const seed = [...value].reduce((total, character) => total + character.charCodeAt(0), 0);
  return EVENT_STYLES[seed % EVENT_STYLES.length];
}

type Props = {
  title: string;
  classes: AssignedClassRow[];
  loading: boolean;
  emptyText: string;
  /** Muestra el profesor en todas las clases (no solo en las suplencias). */
  showTeacher: boolean;
  /** Controles extra junto al selector de semana. */
  controls?: ReactNode;
};

/** Horario por semana: lo usan "Clases" (profesor) y "Programación de clases del equipo". */
export default function WeekSchedule({ title, classes, loading, emptyText, showTeacher, controls }: Props) {
  const [chosenWeek, setChosenWeek] = useState("");

  const availableWeekStarts = useMemo(
    () => [...new Set(classes.map((assignedClass) => mondayKey(assignedClass.classDate)))].sort(),
    [classes],
  );
  // Si la semana elegida no tiene clases, se muestra la actual o la siguiente que sí.
  const selectedWeekStart = availableWeekStarts.includes(chosenWeek)
    ? chosenWeek
    : (availableWeekStarts.find((week) => week >= mondayKey(dateKey(new Date()))) ?? availableWeekStarts.at(-1) ?? "");
  const selectedWeekDates = useMemo(() => {
    if (!selectedWeekStart) return [];
    const monday = dateFromKey(selectedWeekStart);
    return WEEK_DAYS.map((day, index) => ({
      day,
      date: addDays(monday, index),
      key: dateKey(addDays(monday, index)),
    }));
  }, [selectedWeekStart]);
  const classesByDate = useMemo(() => {
    const grouped = new Map<string, AssignedClassRow[]>();
    classes.forEach((assignedClass) => {
      const current = grouped.get(assignedClass.classDate) ?? [];
      current.push(assignedClass);
      grouped.set(assignedClass.classDate, current);
    });
    grouped.forEach((rows) => rows.sort((left, right) => left.startTime.localeCompare(right.startTime)));
    return grouped;
  }, [classes]);
  const selectedWeekIndex = availableWeekStarts.indexOf(selectedWeekStart);
  const selectedWeekClassCount = selectedWeekDates.reduce(
    (total, day) => total + (classesByDate.get(day.key)?.length ?? 0),
    0,
  );

  return (
    <div className="rounded-lg border border-white/12 bg-white/[0.03] p-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">{title}</p>
          <p className="mt-1 text-xs text-[var(--ink-soft)]">{selectedWeekClassCount} clases en la semana seleccionada</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          {controls}
          <label className="flex min-w-[210px] flex-col gap-1 text-xs text-[var(--ink-soft)]">
            Semana
            <select
              value={selectedWeekStart}
              onChange={(event) => setChosenWeek(event.target.value)}
              className="ui-control"
              disabled={availableWeekStarts.length === 0}
            >
              {availableWeekStarts.map((weekStart) => {
                const monday = dateFromKey(weekStart);
                return (
                  <option key={weekStart} value={weekStart}>
                    {formatCalendarDate(monday)} - {formatCalendarDate(addDays(monday, 6))}
                  </option>
                );
              })}
            </select>
          </label>
          <div className="flex h-9 items-center gap-1">
            <button
              type="button"
              onClick={() => setChosenWeek(availableWeekStarts[selectedWeekIndex - 1])}
              disabled={selectedWeekIndex <= 0}
              className="ui-btn h-9 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Semana anterior"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setChosenWeek(availableWeekStarts[selectedWeekIndex + 1])}
              disabled={selectedWeekIndex < 0 || selectedWeekIndex >= availableWeekStarts.length - 1}
              className="ui-btn h-9 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Semana siguiente"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
      <div className="mt-4">
        {loading ? (
          <p className="text-sm text-[var(--ink-soft)]">Cargando horario...</p>
        ) : classes.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">{emptyText}</p>
        ) : (
          <>
            <div className="hidden overflow-x-auto pb-2 md:block">
              <div className="grid min-w-[980px] grid-cols-7 gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10">
                {selectedWeekDates.map((day) => (
                  <div key={`${day.key}-heading`} className="bg-[var(--surface-strong)] px-2 py-2 text-center">
                    <p className="text-[10px] font-semibold uppercase text-[var(--ink-muted)]">{day.day}</p>
                    <p className="mt-0.5 text-xs font-semibold text-[var(--foreground)]">{formatCalendarDate(day.date)}</p>
                  </div>
                ))}
                {selectedWeekDates.map((day) => {
                  const dayClasses = classesByDate.get(day.key) ?? [];
                  return (
                    <div key={day.key} className="min-h-56 space-y-1.5 bg-[var(--surface)] p-1.5">
                      {dayClasses.length === 0 ? (
                        <p className="py-6 text-center text-[10px] text-[var(--ink-muted)]">Sin clases</p>
                      ) : (
                        dayClasses.map((assignedClass) => (
                          <article
                            key={assignedClass.id}
                            className={`min-h-24 overflow-hidden rounded-md border p-2 text-[10px] ${eventStyle(`${assignedClass.courseName}-${assignedClass.subjectName}`)}`}
                          >
                            <p className="font-mono font-semibold text-[var(--accent)]">
                              {assignedClass.startTime.slice(0, 5)} - {assignedClass.endTime.slice(0, 5)}
                            </p>
                            <p className="mt-1 break-words text-xs font-semibold leading-tight text-[var(--foreground)]">
                              {assignedClass.courseName}
                            </p>
                            <p className="mt-1 break-words leading-tight text-[var(--ink-soft)]">{assignedClass.subjectName}</p>
                            <p className="mt-1 break-words leading-tight text-[var(--ink-muted)]">
                              {assignedClass.classroom || "Sin aula"}
                            </p>
                            {showTeacher || assignedClass.isCovered ? (
                              <p className="mt-1 break-words leading-tight text-[var(--ink-muted)]">
                                {assignedClass.effectiveTeacherName || assignedClass.teacherName}
                              </p>
                            ) : null}
                          </article>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 md:hidden">
              {selectedWeekDates.map((day) => {
                const dayClasses = classesByDate.get(day.key) ?? [];
                return (
                  <section key={day.key} className="border-t border-white/10 pt-2 first:border-t-0 first:pt-0">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-xs font-semibold text-[var(--foreground)]">{day.day}</h2>
                      <span className="text-[10px] text-[var(--ink-muted)]">{formatCalendarDate(day.date)}</span>
                    </div>
                    {dayClasses.length === 0 ? (
                      <p className="mt-1 text-xs text-[var(--ink-muted)]">Sin clases</p>
                    ) : (
                      <div className="mt-1.5 space-y-1.5">
                        {dayClasses.map((assignedClass) => (
                          <article
                            key={assignedClass.id}
                            className={`grid grid-cols-[72px_1fr] gap-2 rounded-md border p-2 text-xs ${eventStyle(`${assignedClass.courseName}-${assignedClass.subjectName}`)}`}
                          >
                            <p className="font-mono text-[10px] font-semibold text-[var(--accent)]">
                              {assignedClass.startTime.slice(0, 5)}
                              <br />
                              {assignedClass.endTime.slice(0, 5)}
                            </p>
                            <div className="min-w-0">
                              <p className="break-words font-semibold text-[var(--foreground)]">{assignedClass.courseName}</p>
                              <p className="break-words text-[var(--ink-soft)]">
                                {assignedClass.subjectName} · {assignedClass.classroom || "Sin aula"}
                              </p>
                              {showTeacher || assignedClass.isCovered ? (
                                <p className="break-words text-[var(--ink-muted)]">
                                  {assignedClass.effectiveTeacherName || assignedClass.teacherName}
                                </p>
                              ) : null}
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
