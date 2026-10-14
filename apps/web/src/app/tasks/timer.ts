// Pure timer maths shared by the floating widget and the task list.
import type { TaskRow } from "./types";

export const formatClock = (totalSeconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

type TimedTask = Pick<TaskRow, "activeSeconds" | "timerStartedAt">;

/** Seconds already banked plus the run in progress (if the timer is on). */
export const totalTimerSeconds = (task: TimedTask, nowMs: number) =>
  (task.activeSeconds ?? 0) +
  (task.timerStartedAt
    ? Math.max(0, Math.round((nowMs - new Date(task.timerStartedAt).getTime()) / 1000))
    : 0);

/** Original estimate plus the extra hours management approved. */
export const authorizedHoursFor = (
  task: Pick<TaskRow, "estimatedHours" | "authorizedExtraHours">,
) => Number(task.estimatedHours ?? 0) + Number(task.authorizedExtraHours ?? 0);

/** True once the timer passes the authorized hours (tasks without an estimate never do). */
export const isTimerOvertime = (
  task: TimedTask & Pick<TaskRow, "estimatedHours" | "authorizedExtraHours">,
  nowMs: number,
) => {
  const limitSeconds = authorizedHoursFor(task) * 3600;
  return limitSeconds > 0 && totalTimerSeconds(task, nowMs) > limitSeconds;
};

/** "2h 15m" style duration for the task list. */
export const formatActiveDuration = (task: TimedTask, nowMs: number) => {
  const totalSeconds = totalTimerSeconds(task, nowMs);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};
