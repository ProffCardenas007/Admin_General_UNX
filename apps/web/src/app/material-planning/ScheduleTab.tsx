"use client";

import { useMemo, useState } from "react";
import {
  addDays,
  courseSummaries,
  daysBetween,
  describeStart,
  formatDateLong,
  formatDateShort,
  groupName,
  localToday,
  weekBucket,
  weekPosition,
  type StartTone,
} from "./materialMath";
import DatePicker from "./DatePicker";
import { EmptyState, formatNumber, Segmented, TextCell } from "./parts";
import type { KitItem, MaterialItem, MaterialPlanningData, Program, ScheduleEntry } from "./types";
import type { useMaterialPlanning } from "./useMaterialPlanning";

type Actions = Pick<
  ReturnType<typeof useMaterialPlanning>,
  | "updateKit"
  | "createKit"
  | "removeKit"
  | "updateScheduleEntry"
  | "createScheduleEntry"
  | "removeScheduleEntry"
  | "shiftSchedule"
  | "setCourseStart"
  | "updateGroup"
  | "setAssignment"
>;

const START_TONE_STYLES: Record<StartTone, string> = {
  none: "border-amber-200 bg-amber-50 text-amber-800",
  upcoming: "border-sky-200 bg-sky-50 text-sky-800",
  today: "border-emerald-200 bg-emerald-50 text-emerald-700",
  started: "border-slate-200 bg-slate-100 text-slate-600",
};

type Props = {
  data: MaterialPlanningData;
  program: Program;
  actions: Actions;
  onOpenProjection: (courseKey: string) => void;
};

export default function ScheduleTab({ data, program, actions, onOpenProjection }: Props) {
  const [mode, setMode] = useState<"course" | "compare">("course");
  const groups = useMemo(() => data.groups.filter((group) => group.program === program), [data.groups, program]);
  const courses = useMemo(() => courseSummaries(groups), [groups]);
  const [selected, setSelected] = useState<Record<Program, string>>({ PAA: "", EXANI: "", PIENSE: "" });
  const courseKey = courses.some((course) => course.key === selected[program]) ? selected[program] : (courses[0]?.key ?? "");
  const course = courses.find((item) => item.key === courseKey);

  const schedule = useMemo(() => data.schedule.filter((entry) => entry.program === program), [data.schedule, program]);
  const notes = data.notes.filter((note) => note.program === program);
  const dates = schedule.map((entry) => entry.weekStart).filter((value): value is string => Boolean(value)).sort();
  const earliest = dates[0] ?? null;
  const latest = dates[dates.length - 1] ?? null;
  const today = localToday();
  const stale = latest !== null && latest < today;
  const startByCourse = useMemo(() => {
    const map: Record<string, string> = {};
    for (const entry of data.courseStarts) if (entry.program === program) map[entry.courseKey] = entry.startDate;
    return map;
  }, [data.courseStarts, program]);

  return (
    <div className="flex flex-col gap-5">
      {notes.length > 0 ? (
        <div className="flex flex-col gap-2">
          {notes.map((note) => (
            <p key={note.id} className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-900">
              <span aria-hidden="true">ⓘ </span>
              {note.text}
            </p>
          ))}
        </div>
      ) : null}

      {stale && earliest ? (
        <ShiftBanner
          earliest={earliest}
          latest={latest ?? earliest}
          scopeLabel={mode === "course" && course ? course.label : "todos los cursos"}
          onShift={(days) => actions.shiftSchedule(program, days, mode === "course" ? course?.key : undefined)}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Modo"
          value={mode}
          onChange={setMode}
          options={[
            { value: "course", label: "Por curso" },
            { value: "compare", label: "Comparar cursos" },
          ]}
        />
        {mode === "course" ? (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Curso">
            {courses.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={item.key === courseKey}
                onClick={() => setSelected((current) => ({ ...current, [program]: item.key }))}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                  item.key === courseKey
                    ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                    : "border-[var(--line)] bg-white text-[var(--foreground)] hover:border-[var(--accent)]"
                }`}
              >
                {item.label}
                <span className={`ml-2 text-[11px] font-normal ${item.key === courseKey ? "text-white/80" : "text-[var(--ink-muted)]"}`}>
                  {startByCourse[item.key] ? formatDateShort(startByCourse[item.key]) : "sin inicio"}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {mode === "course" && course ? (
        <CourseNameEditor
          key={course.key}
          label={course.label}
          takenLabels={courses.filter((item) => item.key !== course.key).map((item) => item.label)}
          onRename={(name) => {
            const target = course.groups[0];
            if (target) void actions.updateGroup(target.id, { courseLabel: name });
          }}
        />
      ) : null}

      {mode === "compare" ? (
        <CompareView
          courses={courses.map((item) => ({ key: item.key, label: item.label }))}
          schedule={schedule}
          starts={startByCourse}
          today={today}
        />
      ) : course ? (
        <CourseView
          data={data}
          program={program}
          courseKey={course.key}
          courseLabel={course.label}
          students={course.students}
          startDate={startByCourse[course.key] ?? null}
          today={today}
          venues={course.groups.map((group) => groupName(group))}
          schedule={schedule.filter((entry) => entry.courseKey === course.key)}
          kit={data.kits.filter((kit) => kit.program === program && kit.courseKey === course.key)}
          actions={actions}
          onOpenProjection={() => onOpenProjection(course.key)}
        />
      ) : (
        <EmptyState>No hay cursos configurados para este programa. Créalos en Proyección → Grupos y alumnos.</EmptyState>
      )}
    </div>
  );
}

/** Nombre del curso, editable en línea. Cambia en toda la app (filtros, grupos, calendario). */
function CourseNameEditor({
  label,
  takenLabels,
  onRename,
}: {
  label: string;
  takenLabels: string[];
  onRename: (name: string) => void;
}) {
  const [error, setError] = useState("");

  const commit = (name: string) => {
    if (takenLabels.some((taken) => taken.toLowerCase() === name.toLowerCase())) {
      setError(`Ya existe un curso llamado “${name}”.`);
      return;
    }
    setError("");
    onRename(name);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-xs font-semibold text-[var(--ink-muted)]">Nombre del curso</span>
      <div className="w-64 max-w-full">
        <TextCell
          value={label}
          label="Nombre del curso"
          required
          onCommit={commit}
          className="border-[var(--line)] bg-white font-semibold"
        />
      </div>
      <span className="text-xs text-[var(--ink-muted)]">
        Se cambia en todas las sedes. Escribe y pulsa Enter o sal del campo para guardar.
      </span>
      {error ? (
        <p role="alert" className="w-full text-xs text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ShiftBanner({
  earliest,
  latest,
  scopeLabel,
  onShift,
}: {
  earliest: string;
  latest: string;
  scopeLabel: string;
  onShift: (days: number) => void | Promise<void>;
}) {
  const [start, setStart] = useState("");
  const days = start ? daysBetween(earliest, start) : 0;
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="min-w-[260px] flex-1">
        <p className="text-sm font-semibold text-amber-900">Las fechas del calendario ya pasaron</p>
        <p className="text-xs text-amber-800">
          Van del {formatDateShort(earliest)} al {formatDateShort(latest)}. Elige la nueva fecha de inicio y se recorren todas
          las semanas de {scopeLabel} (y su inicio de clases) conservando su orden.
        </p>
      </div>
      <div className="flex flex-col gap-1 text-xs font-semibold text-amber-900">
        Nuevo inicio
        <DatePicker label="Nuevo inicio del calendario" value={start || null} placeholder="Elegir fecha" onConfirm={setStart} />
      </div>
      <button
        type="button"
        className="ui-btn ui-btn-primary"
        disabled={!start || days === 0}
        onClick={() => {
          if (window.confirm(`Se moverán las fechas de ${scopeLabel} ${days > 0 ? "+" : ""}${days} días. ¿Continuar?`)) {
            void onShift(days);
            setStart("");
          }
        }}
      >
        Recorrer fechas
      </button>
    </div>
  );
}

function CourseView({
  data,
  program,
  courseKey,
  courseLabel,
  students,
  startDate,
  today,
  venues,
  schedule,
  kit,
  actions,
  onOpenProjection,
}: {
  data: MaterialPlanningData;
  program: Program;
  courseKey: string;
  courseLabel: string;
  students: number;
  startDate: string | null;
  today: string;
  venues: string[];
  schedule: ScheduleEntry[];
  kit: KitItem[];
  actions: Actions;
  onOpenProjection: () => void;
}) {
  const sorted = useMemo(
    () =>
      [...schedule].sort(
        (a, b) => (a.weekStart ?? "").localeCompare(b.weekStart ?? "") || (b.weekNumber ?? 0) - (a.weekNumber ?? 0),
      ),
    [schedule],
  );
  const [addingWeek, setAddingWeek] = useState(false);
  const datedWeeks = sorted.filter((entry) => entry.weekStart);
  const firstDate = datedWeeks[0]?.weekStart ?? null;
  const lastDate = datedWeeks[datedWeeks.length - 1]?.weekStart ?? null;

  const [editingMaterial, setEditingMaterial] = useState(false);
  const courseGroupIds = data.groups
    .filter((group) => group.program === program && group.courseKey === courseKey)
    .map((group) => group.id);
  const activeByKind = new Map<string, MaterialItem[]>();
  for (const item of data.items) {
    if (item.program !== program || item.doNotUse) continue;
    activeByKind.set(item.kind, [...(activeByKind.get(item.kind) ?? []), item]);
  }
  // El paquete es del curso: se asigna o quita en todas sus sedes a la vez.
  const setForCourse = (itemId: string, assigned: boolean) => {
    for (const groupId of courseGroupIds) void actions.setAssignment([itemId], groupId, assigned);
  };

  // Materiales que recibe el curso, agrupados por tipo.
  const received = useMemo(() => {
    const groupIds = new Set(
      data.groups.filter((group) => group.program === program && group.courseKey === courseKey).map((group) => group.id),
    );
    const byKind = new Map<string, string[]>();
    let count = 0;
    for (const item of data.items) {
      if (item.program !== program || item.doNotUse) continue;
      if (!item.groupIds.some((id) => groupIds.has(id))) continue;
      count += 1;
      const label = [item.version, item.module].filter(Boolean).join(" · ") || "—";
      byKind.set(item.kind, [...(byKind.get(item.kind) ?? []), label]);
    }
    return { count, kinds: [...byKind.entries()] };
  }, [data.groups, data.items, program, courseKey]);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
        <StartCard
          courseLabel={courseLabel}
          startDate={startDate}
          today={today}
          firstCalendarDate={sorted.find((entry) => entry.weekStart)?.weekStart ?? null}
          onChange={(next) => actions.setCourseStart(program, courseKey, next)}
          onAlignCalendar={(days) => actions.shiftSchedule(program, days, courseKey)}
        />

        <section className="glass-panel p-5">
          <h2 className="font-semibold">Paquete de {courseLabel}</h2>
          <p className="text-xs text-[var(--ink-muted)]">
            {formatNumber(students)} alumnos{venues.length > 1 ? ` · ${venues.join(" / ")}` : ""}
          </p>
          {kit.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--ink-muted)]">Sin paquete configurado. Agrega el primer renglón abajo.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1.5">
              {[...kit]
                .sort((a, b) => a.position - b.position)
                .map((row) => (
                  <li
                    key={row.id}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${
                      row.qty > 0 ? "border-[var(--line)] bg-white" : "border-dashed border-[var(--line)] bg-transparent text-[var(--ink-muted)]"
                    }`}
                  >
                    <TextCell
                      value={row.item}
                      label={`Nombre del renglón ${row.item}`}
                      required
                      className="min-w-0 flex-1"
                      onCommit={(value) => actions.updateKit(row.id, { item: value })}
                    />
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Quitar uno de ${row.item}`}
                        className="h-7 w-7 rounded-full border border-[var(--line)] bg-white leading-none hover:border-[var(--accent)] disabled:opacity-40"
                        disabled={row.qty <= 0}
                        onClick={() => actions.updateKit(row.id, { qty: row.qty - 1 })}
                      >
                        −
                      </button>
                      <span className="w-8 text-center font-semibold tabular-nums">{row.qty > 0 ? row.qty : "—"}</span>
                      <button
                        type="button"
                        aria-label={`Agregar uno de ${row.item}`}
                        className="h-7 w-7 rounded-full border border-[var(--line)] bg-white leading-none hover:border-[var(--accent)]"
                        onClick={() => actions.updateKit(row.id, { qty: row.qty + 1 })}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        aria-label={`Quitar ${row.item} del paquete`}
                        title="Quitar del paquete"
                        className="ml-1 h-7 w-7 rounded-full text-[var(--ink-muted)] leading-none hover:text-[var(--danger)]"
                        onClick={() => {
                          if (window.confirm(`¿Quitar “${row.item}” del paquete de ${courseLabel}?`)) void actions.removeKit(row.id);
                        }}
                      >
                        ×
                      </button>
                    </span>
                  </li>
                ))}
            </ul>
          )}
          <AddKitForm onAdd={(item, qty) => actions.createKit({ program, courseKey, item, qty })} />
        </section>

        <section className="glass-panel p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold">Material que recibe</h2>
              <p className="text-xs text-[var(--ink-muted)]">{received.count} materiales activos</p>
            </div>
            <div className="flex flex-wrap justify-end gap-1">
              <button
                type="button"
                className={`ui-btn ui-btn-sm ${editingMaterial ? "ui-btn-primary" : "ui-btn-secondary"}`}
                onClick={() => setEditingMaterial((open) => !open)}
              >
                {editingMaterial ? "Listo" : "Editar"}
              </button>
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={onOpenProjection}>
                Ver en proyección →
              </button>
            </div>
          </div>
          {editingMaterial ? (
            <div className="mt-3 flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1">
              <p className="text-xs text-[var(--ink-muted)]">
                Toca un material para agregarlo o quitarlo. Azul = lo recibe; punteado = solo en algunas sedes.
              </p>
              {[...activeByKind.entries()].map(([kind, list]) => (
                <div key={kind}>
                  <p className="text-xs font-semibold text-[var(--ink-muted)]">{kind}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {list.map((item) => {
                      const assignedIn = courseGroupIds.filter((id) => item.groupIds.includes(id)).length;
                      const all = assignedIn === courseGroupIds.length;
                      const partial = assignedIn > 0 && !all;
                      const label = [item.version, item.module].filter(Boolean).join(" · ") || "—";
                      return (
                        <button
                          key={item.id}
                          type="button"
                          aria-pressed={all ? true : partial ? "mixed" : false}
                          aria-label={`${kind} ${label}`}
                          title={partial ? "Solo en algunas sedes: toca para darlo a todas" : all ? "Quitar del curso" : "Agregar al curso"}
                          onClick={() => setForCourse(item.id, !all)}
                          className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${
                            all
                              ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                              : partial
                                ? "border-dashed border-[var(--accent)] bg-white text-[var(--accent)]"
                                : "border-[var(--line)] bg-white text-[var(--ink-muted)] hover:border-[var(--accent)]"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : received.kinds.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--ink-muted)]">Este curso todavía no tiene material asignado.</p>
          ) : (
            <div className="mt-3 flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1">
              {received.kinds.map(([kind, labels]) => (
                <div key={kind}>
                  <p className="text-xs font-semibold text-[var(--ink-muted)]">{kind}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {labels.map((label, index) => (
                      <span key={`${label}-${index}`} className="rounded-md border border-[var(--line)] bg-white px-1.5 py-0.5 text-[11px]">
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="glass-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Calendario de exámenes</h2>
            <p className="text-xs text-[var(--ink-muted)]">
              Haz clic en una fecha para cambiarla. Cada clic en el botón de color de una semana cambia su tipo.
            </p>
          </div>
          <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => setAddingWeek((open) => !open)}>
            {addingWeek ? "Cancelar" : "+ Agregar semana"}
          </button>
        </div>
        {addingWeek ? (
          <AddWeekForm
            courseLabel={courseLabel}
            startDate={startDate}
            suggestedDate={lastDate ? addDays(lastDate, 7) : (startDate ?? null)}
            onCreate={async (input) => {
              const ok = await actions.createScheduleEntry({ program, courseKey, ...input });
              if (ok) setAddingWeek(false);
            }}
          />
        ) : null}
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Leyenda de colores">
          <li className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${DOT_STYLES.exam}`} aria-hidden="true" /> Lleva examen
          </li>
          <li className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${DOT_STYLES.none}`} aria-hidden="true" /> Sin examen
          </li>
          <li className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${DOT_STYLES.break}`} aria-hidden="true" /> Situación especial (Semana santa, puente…)
          </li>
          <li className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${DOT_STYLES.end}`} aria-hidden="true" /> Cierre
          </li>
        </ul>
        {sorted.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--ink-muted)]">Sin calendario para este curso.</p>
        ) : (
          <ol className="mt-4 flex flex-col">
            {sorted.map((entry, index) => (
              <TimelineRow
                key={entry.id}
                entry={entry}
                position={entry.weekStart && firstDate && lastDate ? weekPosition(entry.weekStart, firstDate, lastDate) : null}
                last={index === sorted.length - 1}
                onLabel={(label) => actions.updateScheduleEntry(entry.id, { label })}
                onKind={(kind, label) => actions.updateScheduleEntry(entry.id, { kind, label })}
                onDate={(weekStart) => actions.updateScheduleEntry(entry.id, { weekStart })}
                onRemove={() => {
                  if (window.confirm(`¿Quitar "${entry.label}" (${formatDateShort(entry.weekStart)}) del calendario de ${courseLabel}?`)) {
                    void actions.removeScheduleEntry(entry.id);
                  }
                }}
              />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/** Formulario para agregar una semana al calendario del curso. */
function AddWeekForm({
  courseLabel,
  startDate,
  suggestedDate,
  onCreate,
}: {
  courseLabel: string;
  startDate: string | null;
  suggestedDate: string | null;
  onCreate: (input: { weekStart: string; kind: "exam" | "none" | "break"; label?: string }) => Promise<void>;
}) {
  const kinds: Array<{ value: "exam" | "none" | "break"; label: string; style: string }> = [
    { value: "exam", label: "Lleva examen", style: ENTRY_STYLES_ACTIVE.exam },
    { value: "none", label: "Sin examen", style: ENTRY_STYLES_ACTIVE.none },
    { value: "break", label: "Situación especial", style: ENTRY_STYLES_ACTIVE.break },
  ];
  const [date, setDate] = useState<string | null>(suggestedDate);
  const [kind, setKind] = useState<"exam" | "none" | "break">("exam");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const beforeStart = date !== null && startDate !== null && date < startDate;
  const needsLabel = kind !== "none";
  const canSave = date !== null && !beforeStart && !saving;

  const submit = async () => {
    if (!date || !canSave) return;
    setSaving(true);
    await onCreate({ weekStart: date, kind, label: needsLabel && label.trim() ? label.trim() : undefined });
    setSaving(false);
  };

  return (
    <form
      className="mt-4 flex flex-col gap-3 rounded-xl border border-[var(--line)] bg-white/70 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1 text-xs font-semibold text-[var(--ink-muted)]">
          Fecha
          <DatePicker label={`Fecha de la nueva semana de ${courseLabel}`} value={date} placeholder="Elegir fecha" onConfirm={setDate} />
        </div>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-xs font-semibold text-[var(--ink-muted)]">Tipo</legend>
          <div className="flex flex-wrap gap-2">
            {kinds.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={kind === option.value}
                onClick={() => setKind(option.value)}
                className={`rounded-full border px-3 py-1 text-sm font-semibold transition ${
                  kind === option.value ? option.style : "border-[var(--line)] bg-white text-[var(--ink-muted)] hover:border-[var(--accent)]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
        {needsLabel ? (
          <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs font-semibold text-[var(--ink-muted)]">
            {kind === "exam" ? "Examen" : "Motivo"}
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              maxLength={160}
              placeholder={kind === "exam" ? "Ej. B | 2" : "Ej. Semana santa"}
              className="ui-control min-h-[40px] py-1.5 text-sm font-normal text-[var(--foreground)]"
            />
          </label>
        ) : null}
        <button type="submit" className="ui-btn ui-btn-primary" disabled={!canSave}>
          {saving ? "Agregando…" : "Agregar"}
        </button>
      </div>
      {beforeStart && startDate ? (
        <p className="text-xs text-[var(--danger)]">
          Esa fecha es anterior al inicio de clases ({formatDateLong(startDate)}). Cambia primero el inicio de clases del curso.
        </p>
      ) : null}
    </form>
  );
}

/** Inicio de clases del curso: editable, con cuenta regresiva y opción de alinear el calendario. */
function AddKitForm({ onAdd }: { onAdd: (item: string, qty: number) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  return (
    <form
      className="mt-3 flex items-end gap-2 border-t border-[var(--line)] pt-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const item = name.trim();
        if (!item) return;
        if (await onAdd(item, Math.max(0, Math.round(Number(qty) || 0)))) {
          setName("");
          setQty("1");
        }
      }}
    >
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-semibold text-[var(--ink-muted)]">
        Agregar al paquete
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          placeholder="Ej. Cuaderno de ejercicios"
          className="ui-control min-h-[38px] py-1 text-sm font-normal text-[var(--foreground)]"
        />
      </label>
      <label className="flex w-16 flex-col gap-1 text-xs font-semibold text-[var(--ink-muted)]">
        Cant.
        <input
          type="number"
          min={0}
          max={1000}
          value={qty}
          onChange={(event) => setQty(event.target.value)}
          className="ui-control min-h-[38px] py-1 text-sm font-normal text-[var(--foreground)]"
        />
      </label>
      <button type="submit" className="ui-btn ui-btn-primary ui-btn-sm" disabled={!name.trim()}>
        Agregar
      </button>
    </form>
  );
}

function StartCard({
  courseLabel,
  startDate,
  today,
  firstCalendarDate,
  onChange,
  onAlignCalendar,
}: {
  courseLabel: string;
  startDate: string | null;
  today: string;
  firstCalendarDate: string | null;
  onChange: (startDate: string | null) => void | Promise<void>;
  onAlignCalendar: (days: number) => void | Promise<void>;
}) {
  const status = describeStart(startDate, today);

  // El calendario del curso arranca siempre en su inicio de clases: el servidor lo recorre al guardar.
  const change = (next: string) => {
    if (!next || next === startDate) return;
    void onChange(next);
  };

  const misaligned = startDate !== null && firstCalendarDate !== null && firstCalendarDate !== startDate;

  return (
    <section className="glass-panel p-5">
      <h2 className="font-semibold">Inicio de clases</h2>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <DatePicker
          label={`Inicio de clases de ${courseLabel}`}
          value={startDate}
          placeholder="Elegir fecha de inicio"
          onConfirm={change}
        />
        {startDate ? (
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => void onChange(null)}>
            Quitar
          </button>
        ) : null}
      </div>
      <p className={`mt-3 inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${START_TONE_STYLES[status.tone]}`}>
        {status.text}
      </p>
      {startDate ? (
        <p className="mt-2 text-xs text-[var(--ink-muted)]">{formatDateLong(startDate)}</p>
      ) : (
        <p className="mt-2 text-xs text-[var(--ink-muted)]">Elige la fecha en que {courseLabel} inicia clases.</p>
      )}
      <p className="mt-2 text-xs text-[var(--ink-muted)]">
        El calendario de exámenes se ajusta solo: su primera semana siempre es el inicio de clases.
      </p>
      {misaligned && startDate && firstCalendarDate ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          El calendario empieza el {formatDateLong(firstCalendarDate)}, distinto al inicio de clases.
          <button
            type="button"
            className="ui-btn ui-btn-secondary ui-btn-sm ml-2"
            onClick={() => void onAlignCalendar(daysBetween(firstCalendarDate, startDate))}
          >
            Alinear calendario
          </button>
        </div>
      ) : null}
    </section>
  );
}

const ENTRY_STYLES: Record<ScheduleEntry["kind"], string> = {
  exam: "border-[var(--accent)]/25 bg-[var(--accent)]/10 text-[var(--accent)]",
  none: "border-red-200 bg-red-50 text-[var(--danger)]",
  break: "border-slate-200 bg-slate-100 text-slate-600",
  end: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

/** Versión "seleccionada" de cada tipo (sólido), para los selectores de tipo. */
const ENTRY_STYLES_ACTIVE: Record<"exam" | "none" | "break", string> = {
  exam: "border-[var(--accent)] bg-[var(--accent)] text-white",
  none: "border-[var(--danger)] bg-[var(--danger)] text-white",
  break: "border-slate-500 bg-slate-500 text-white",
};

const DOT_STYLES: Record<ScheduleEntry["kind"], string> = {
  exam: "bg-[var(--accent)]",
  none: "bg-[var(--danger)]",
  break: "bg-slate-300",
  end: "bg-emerald-500",
};

function TimelineRow({
  entry,
  position,
  last,
  onLabel,
  onKind,
  onDate,
  onRemove,
}: {
  entry: ScheduleEntry;
  position: { index: number; total: number } | null;
  last: boolean;
  onLabel: (label: string) => void;
  onKind: (kind: "exam" | "none" | "break", label?: string) => void;
  onDate: (date: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState<"label" | null>(null);
  // Textos de cada estado antes de salir de él, para devolverlos si se vuelve a ese estado.
  const [remembered, setRemembered] = useState<{ exam?: string; break?: string }>({});
  const togglable = entry.kind === "exam" || entry.kind === "none" || entry.kind === "break";

  /** Ciclo del botón: azul (examen) → rojo (sin examen) → gris (situación especial) → azul. */
  const cycle = () => {
    if (entry.kind === "exam") {
      setRemembered((current) => ({ ...current, exam: entry.label }));
      onKind("none");
    } else if (entry.kind === "none") {
      if (remembered.break) {
        onKind("break", remembered.break);
      } else {
        onKind("break");
        setEditing("label"); // pedir el motivo: "Semana santa", "Puente", etc.
      }
    } else {
      setRemembered((current) => ({ ...current, break: entry.label }));
      if (remembered.exam) {
        onKind("exam", remembered.exam);
      } else {
        onKind("exam", "Examen");
        setEditing("label");
      }
    }
  };

  const NEXT_HINT: Record<"exam" | "none" | "break", string> = {
    exam: "Lleva examen · clic para marcar “Sin examen”",
    none: "Sin examen · clic para marcar situación especial (gris)",
    break: "Situación especial · clic para que lleve examen",
  };

  return (
    <li className="relative flex gap-4 pb-4">
      {!last ? <span aria-hidden="true" className="absolute left-[7px] top-4 h-full w-px bg-[var(--line)]" /> : null}
      <span
        aria-hidden="true"
        className={`relative mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-2 border-white ring-1 ring-[var(--line)] ${DOT_STYLES[entry.kind]}`}
      />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
        <div className="w-24 shrink-0">
          <DatePicker
            variant="link"
            label={`Fecha de la semana de ${entry.label}`}
            value={entry.weekStart}
            format={formatDateShort}
            placeholder="Sin fecha"
            onConfirm={onDate}
          />
          <p className="text-[11px] text-[var(--ink-muted)]">
            {position ? `Semana ${position.index} de ${position.total}` : "—"}
          </p>
        </div>
        {editing === "label" ? (
          <input
            autoFocus
            defaultValue={entry.label}
            maxLength={160}
            onBlur={(event) => {
              const next = event.target.value.trim();
              if (next && next !== entry.label) onLabel(next);
              setEditing(null);
            }}
            onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
            className="ui-control min-h-[34px] w-56 py-1 text-sm"
          />
        ) : togglable ? (
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={cycle}
              title={NEXT_HINT[entry.kind as "exam" | "none" | "break"]}
              aria-label={`${entry.label}. ${NEXT_HINT[entry.kind as "exam" | "none" | "break"]}`}
              className={`rounded-full border px-3 py-1 text-sm font-semibold transition hover:brightness-95 ${ENTRY_STYLES[entry.kind]}`}
            >
              {entry.label}
            </button>
            {entry.kind === "exam" || entry.kind === "break" ? (
              <button
                type="button"
                aria-label={`Editar el texto de ${entry.label}`}
                title={entry.kind === "exam" ? "Editar el texto del examen" : "Editar el motivo"}
                onClick={() => setEditing("label")}
                className="rounded-full px-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--accent)]"
              >
                ✎
              </button>
            ) : null}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setEditing("label")}
            className={`rounded-full border px-3 py-1 text-sm font-semibold ${ENTRY_STYLES[entry.kind]}`}
          >
            {entry.label}
          </button>
        )}
        <button
          type="button"
          aria-label={`Quitar ${entry.label} del calendario`}
          title="Quitar del calendario"
          onClick={onRemove}
          className="ml-auto rounded-full px-2 text-lg leading-none text-[var(--ink-muted)] hover:text-[var(--danger)]"
        >
          ×
        </button>
      </div>
    </li>
  );
}

/** Todas las semanas × todos los cursos, como la hoja original pero legible. */
function CompareView({
  courses,
  schedule,
  starts,
  today,
}: {
  courses: Array<{ key: string; label: string }>;
  schedule: ScheduleEntry[];
  starts: Record<string, string>;
  today: string;
}) {
  const { weeks, cells } = useMemo(() => {
    const cellMap = new Map<string, ScheduleEntry[]>();
    const weekSet = new Set<string>();
    for (const entry of schedule) {
      if (!entry.weekStart) continue;
      const week = weekBucket(entry.weekStart);
      weekSet.add(week);
      const key = `${week}|${entry.courseKey}`;
      cellMap.set(key, [...(cellMap.get(key) ?? []), entry]);
    }
    return { weeks: [...weekSet].sort(), cells: cellMap };
  }, [schedule]);

  if (weeks.length === 0) return <EmptyState>Sin calendario para comparar.</EmptyState>;

  return (
    <section className="glass-panel overflow-hidden">
      <div className="max-h-[72vh] overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 min-w-[120px] border-b border-r border-[var(--line)] bg-[#f6f8ff] px-3 py-2 text-left">
                Semana del
              </th>
              {courses.map((course) => (
                <th key={course.key} className="sticky top-0 z-10 min-w-[110px] border-b border-[var(--line)] bg-[#f6f8ff] px-3 py-2 text-left text-xs">
                  {course.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-sky-50/60">
              <td className="sticky left-0 z-10 border-b border-r border-[var(--line)] bg-sky-50 px-3 py-2 text-xs font-semibold">
                Inicio de clases
              </td>
              {courses.map((course) => {
                const status = describeStart(starts[course.key], today);
                return (
                  <td key={course.key} className="border-b border-[var(--line)]/60 px-2 py-1.5 align-top">
                    {starts[course.key] ? (
                      <>
                        <p className="font-mono text-xs">{formatDateShort(starts[course.key])}</p>
                        <p className="text-[11px] text-[var(--ink-muted)]">{status.text}</p>
                      </>
                    ) : (
                      <p className="text-[11px] text-amber-700">Sin fecha</p>
                    )}
                  </td>
                );
              })}
            </tr>
            {weeks.map((week) => (
              <tr key={week} className="hover:bg-white/70">
                <td className="sticky left-0 z-10 border-b border-r border-[var(--line)] bg-[#fbfcff] px-3 py-2 font-mono text-xs">
                  {formatDateShort(week)}
                </td>
                {courses.map((course) => (
                  <td key={course.key} className="border-b border-[var(--line)]/60 px-2 py-1.5 align-top">
                    <div className="flex flex-wrap gap-1">
                      {(cells.get(`${week}|${course.key}`) ?? []).map((entry) => (
                        <span key={entry.id} className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ENTRY_STYLES[entry.kind]}`}>
                          {entry.label}
                        </span>
                      ))}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
