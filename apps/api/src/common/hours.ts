/**
 * Real hours logged on a task_updates row: manual hours plus the time
 * recorded by the task timer. Single definition shared by dashboard and reports.
 */
export function realHoursSql(alias: string) {
  return `(${alias}.worked_hours + COALESCE(${alias}.timer_seconds, 0) / 3600.0)`;
}
