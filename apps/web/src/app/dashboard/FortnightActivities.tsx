"use client";

import { useMemo, useRef, useState } from "react";
import { buildFortnightCards, filterCardsByName } from "./metrics";
import {
  roleLabels,
  taskStatusLabel,
  type ClassHoursRow,
  type Fortnight,
  type ProjectRow,
  type TaskRow,
  type UserOption,
} from "./types";

export default function FortnightActivities({
  users,
  tasks,
  classHours,
  projectsById,
  fortnight: currentFortnight,
}: {
  users: UserOption[];
  tasks: TaskRow[];
  classHours: ClassHoursRow[];
  projectsById: Record<string, ProjectRow>;
  fortnight: Fortnight;
}) {
  const fortnightCardsRef = useRef<HTMLDivElement>(null);
  const [fortnightUserSearch, setFortnightUserSearch] = useState("");

  const currentFortnightCards = useMemo(
    () => buildFortnightCards({ users, tasks, classHours, fortnight: currentFortnight }),
    [users, tasks, classHours, currentFortnight],
  );

  const filteredFortnightCards = useMemo(
    () => filterCardsByName(currentFortnightCards, fortnightUserSearch),
    [currentFortnightCards, fortnightUserSearch],
  );

  const scrollFortnightCards = (direction: -1 | 1) => {
    const viewport = fortnightCardsRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollBy({
      left: direction * Math.min(viewport.clientWidth * 0.85, 380),
      behavior: "smooth",
    });
  };

  return (
      <section className="kpi-card fade-up p-5" style={{ animationDelay: "360ms" }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Actividades de la quincena actual</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              {currentFortnight.label} · meta de {currentFortnight.targetHours} h ({currentFortnight.businessDays} días hábiles × 9 h)
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => scrollFortnightCards(-1)}
              className="ui-btn ui-btn-secondary ui-btn-sm h-9 w-9 p-0 text-lg"
              aria-label="Ver tarjetas anteriores"
              title="Anterior"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => scrollFortnightCards(1)}
              className="ui-btn ui-btn-secondary ui-btn-sm h-9 w-9 p-0 text-lg"
              aria-label="Ver tarjetas siguientes"
              title="Siguiente"
            >
              →
            </button>
          </div>
        </div>

        <input
          type="search"
          value={fortnightUserSearch}
          onChange={(event) => setFortnightUserSearch(event.target.value)}
          placeholder="Buscar persona por nombre..."
          aria-label="Buscar persona en actividades de la quincena"
          className="mt-4 w-full max-w-sm rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
        />

        {currentFortnightCards.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--ink-muted)]">
            No hay usuarios activos para mostrar.
          </p>
        ) : filteredFortnightCards.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--ink-muted)]">
            Ninguna persona coincide con &quot;{fortnightUserSearch}&quot;.
          </p>
        ) : (
          <div
            ref={fortnightCardsRef}
            className="mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3"
            aria-label="Tarjetas de actividades de la quincena"
          >
            {filteredFortnightCards.map(({ user, activities, activityHours, classHours: userClassHours, classSessions, totalHours, remainingHours, exceededHours }) => (
              <article
                key={user.id}
                className="flex h-[430px] w-full max-w-[380px] shrink-0 snap-start flex-col rounded-2xl border border-[var(--line)] bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] pb-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold" title={user.fullName}>
                      {user.fullName}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                      {roleLabels[user.role]}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xl font-semibold text-[var(--accent)]">{totalHours.toFixed(2)} h</p>
                    <p className="text-xs text-[var(--ink-muted)]">de {currentFortnight.targetHours} h</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 border-b border-[var(--line)] py-3 text-center">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">Actividades</p>
                    <p className="mt-1 text-sm font-semibold">{activityHours.toFixed(2)} h</p>
                  </div>
                  <div className="border-x border-[var(--line)] px-1">
                    <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">Clases</p>
                    <p className="mt-1 text-sm font-semibold">{userClassHours.toFixed(2)} h</p>
                    <p className="text-[10px] text-[var(--ink-muted)]">{classSessions} sesiones</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                      {exceededHours > 0 ? "Exceso" : "Disponible"}
                    </p>
                    <p className={`mt-1 text-sm font-semibold ${exceededHours > 0 ? "text-[var(--danger)]" : "text-emerald-700"}`}>
                      {(exceededHours > 0 ? exceededHours : remainingHours).toFixed(2)} h
                    </p>
                  </div>
                </div>

                <div className="py-3">
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--background)]">
                    <div
                      className={`h-full rounded-full ${exceededHours > 0 ? "bg-[var(--danger)]" : "bg-[var(--accent)]"}`}
                      style={{ width: `${Math.min((totalHours / currentFortnight.targetHours) * 100, 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-right text-[10px] text-[var(--ink-muted)]">
                    {Math.round((totalHours / currentFortnight.targetHours) * 100)}% ocupado
                  </p>
                </div>

                {activities.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center text-center text-sm text-[var(--ink-muted)]">
                    Sin actividades adicionales en esta quincena.
                  </div>
                ) : (
                  <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                    {activities.map((task) => {
                      const taskHours = Number(task.estimatedHours ?? 0);
                      return (
                        <div key={task.id} className="border-b border-[var(--line)] py-3 last:border-b-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="break-words text-sm font-semibold">{task.title}</p>
                              <p className="mt-1 text-xs text-[var(--ink-muted)]">
                                {projectsById[task.projectId]?.name ?? "Sin proyecto"} · {task.activityType}
                              </p>
                            </div>
                            <p className="shrink-0 text-sm font-semibold">
                              {(Number.isFinite(taskHours) ? taskHours : 0).toFixed(2)} h
                            </p>
                          </div>
                          <p className="mt-2 text-xs font-semibold text-[var(--ink-muted)]">
                            {taskStatusLabel(task)} · vence {task.dueDate}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
  );
}
