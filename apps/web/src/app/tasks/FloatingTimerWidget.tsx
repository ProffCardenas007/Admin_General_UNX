"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { authorizedHoursFor, formatClock, isTimerOvertime, totalTimerSeconds } from "./timer";
import type { TaskRow } from "./types";

export const FLOATING_TIMER_WIDTH = 280;

export default function FloatingTimerWidget({
  task,
  position,
  minimized,
  saving,
  nowTick,
  onDragPointerDown,
  onDragPointerMove,
  onDragPointerUp,
  onToggleMinimize,
  onClose,
  onStart,
  onPause,
  onFinish,
  onRequestExtension,
}: {
  task: TaskRow;
  position: { x: number; y: number };
  minimized: boolean;
  saving: boolean;
  nowTick: number;
  onDragPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onDragPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onDragPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onToggleMinimize: () => void;
  onClose: () => void;
  onStart: () => void;
  onPause: () => void;
  onFinish: () => void;
  onRequestExtension: () => void;
}) {
  const totalSeconds = totalTimerSeconds(task, nowTick);
  const authorizedHours = authorizedHoursFor(task);
  const isOvertime = isTimerOvertime(task, nowTick);

  if (minimized) {
    return (
      <div
        style={{ left: position.x, top: position.y }}
        className={`fixed z-[70] flex items-center gap-2 rounded-full border px-3 py-2 shadow-xl select-none ${
          isOvertime ? "border-red-300 bg-red-50" : "border-[var(--line)] bg-white"
        }`}
      >
        <div
          onPointerDown={onDragPointerDown}
          onPointerMove={onDragPointerMove}
          onPointerUp={onDragPointerUp}
          className="cursor-grab text-[var(--ink-muted)] active:cursor-grabbing"
          title="Mover"
        >
          ⠿
        </div>
        <button onClick={onToggleMinimize} className="flex items-center gap-2">
          <span
            className={`font-mono text-sm font-semibold ${
              isOvertime ? "text-red-700" : "text-[var(--foreground)]"
            }`}
          >
            {formatClock(totalSeconds)}
          </span>
          <span className="max-w-[120px] truncate text-xs text-[var(--ink-muted)]">{task.title}</span>
        </button>
      </div>
    );
  }

  return (
    <div
      style={{ left: position.x, top: position.y, width: FLOATING_TIMER_WIDTH }}
      className={`fixed z-[70] rounded-2xl border shadow-2xl select-none ${
        isOvertime ? "border-red-300 bg-red-50" : "border-[var(--line)] bg-white"
      }`}
    >
      <div
        onPointerDown={onDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={onDragPointerUp}
        className="flex cursor-grab items-center justify-between gap-2 rounded-t-2xl border-b border-[var(--line)] px-3 py-2 active:cursor-grabbing"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">
          Cronómetro
        </span>
        <div className="flex items-center gap-1">
          <button
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onToggleMinimize}
            className="rounded px-1.5 py-0.5 text-xs font-semibold text-[var(--ink-muted)] hover:bg-[var(--background)]"
            title="Minimizar"
          >
            &#8211;
          </button>
          <button
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClose}
            className="rounded px-1.5 py-0.5 text-xs font-semibold text-[var(--ink-muted)] hover:bg-[var(--background)]"
            title="Cerrar"
          >
            &#10005;
          </button>
        </div>
      </div>

      <div className="px-4 py-3">
        <p className="truncate text-sm font-semibold">{task.title}</p>
        <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{task.code}</p>

        <p
          className={`mt-3 text-center font-mono text-3xl font-bold ${
            isOvertime ? "text-red-700" : "text-[var(--foreground)]"
          }`}
        >
          {formatClock(totalSeconds)}
        </p>

        {isOvertime ? (
          <p className="mt-1 text-center text-xs font-semibold text-red-700">
            Superaste el tiempo autorizado ({authorizedHours.toFixed(1)} h)
          </p>
        ) : task.status === "paused" ? (
          <p className="mt-1 text-center text-xs font-semibold text-amber-700">Pausada</p>
        ) : null}

        {isOvertime ? (
          <button
            type="button"
            onClick={onRequestExtension}
            className="ui-btn ui-btn-secondary ui-btn-sm mt-2 w-full"
          >
            Solicitar más horas
          </button>
        ) : null}

        <div className="mt-3 grid grid-cols-2 gap-2">
          {task.status === "todo" || task.status === "paused" ? (
            <button
              onClick={onStart}
              disabled={saving}
              className="ui-btn ui-btn-primary ui-btn-sm col-span-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Iniciar
            </button>
          ) : null}
          {task.status === "doing" ? (
            <button
              onClick={onPause}
              disabled={saving}
              className="ui-btn ui-btn-secondary ui-btn-sm disabled:cursor-not-allowed disabled:opacity-70"
            >
              Pausar
            </button>
          ) : null}
          {task.status === "doing" || task.status === "paused" ? (
            <button
              onClick={onFinish}
              disabled={saving}
              className={`ui-btn ui-btn-secondary ui-btn-sm disabled:cursor-not-allowed disabled:opacity-70 ${
                task.status === "paused" ? "col-span-2" : ""
              }`}
            >
              Finalizar
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
