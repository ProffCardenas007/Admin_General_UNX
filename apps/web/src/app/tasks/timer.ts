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

/** A timer left running this long is probably forgotten (e.g. overnight). */
export const STALE_TIMER_HOURS = 10;

export const isTimerStale = (
  task: Pick<TaskRow, "timerStartedAt">,
  nowMs: number,
  hours = STALE_TIMER_HOURS,
) =>
  !!task.timerStartedAt &&
  nowMs - new Date(task.timerStartedAt).getTime() > hours * 3_600_000;

/** Time used against the authorized hours, for a progress bar. */
export const timerProgress = (
  task: TimedTask & Pick<TaskRow, "estimatedHours" | "authorizedExtraHours">,
  nowMs: number,
) => {
  const limitSeconds = authorizedHoursFor(task) * 3600;
  const usedSeconds = totalTimerSeconds(task, nowMs);
  return {
    usedSeconds,
    limitSeconds,
    percent: limitSeconds > 0 ? Math.min(100, Math.round((usedSeconds / limitSeconds) * 100)) : 0,
    over: limitSeconds > 0 && usedSeconds > limitSeconds,
  };
};

/** The person's own tasks that have a timer going or saved: running ones first. */
export const pickMyActiveTasks = <T extends Pick<TaskRow, "assigneeId" | "status" | "title">>(
  tasks: T[],
  userId: string,
) =>
  tasks
    .filter((task) => !!userId && task.assigneeId === userId && (task.status === "doing" || task.status === "paused"))
    .sort(
      (a, b) =>
        Number(b.status === "doing") - Number(a.status === "doing") ||
        a.title.localeCompare(b.title, "es"),
    );

export const summarizeActiveTasks = (
  tasks: Array<TimedTask & Pick<TaskRow, "status">>,
  nowMs: number,
) => ({
  running: tasks.filter((task) => task.status === "doing").length,
  paused: tasks.filter((task) => task.status === "paused").length,
  totalSeconds: tasks.reduce((sum, task) => sum + totalTimerSeconds(task, nowMs), 0),
});
