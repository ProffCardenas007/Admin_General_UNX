// Pure rules for the tasks page: dates, filters, urgency, worker summary.
// No React and no runtime imports, so they run under `npm test`.
import type { HalfMonth, ProjectRow, TaskRow, UserRow } from "./types";
import { UNASSIGNED_SENTINEL, roleLabels } from "./labels.ts";

// ----------------------------------------------------------------------- dates
export const toDateKey = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export const addDaysToKey = (dateKey: string, days: number) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return toDateKey(new Date(year, month - 1, day + days));
};

/**
 * Whole calendar days from `fromKey` to `toKey` (negative when `toKey` is
 * earlier). Works on dates, not clock time, so "due today" is exactly 0 and
 * "due yesterday" is exactly -1 at any hour.
 */
export const daysBetweenKeys = (fromKey: string, toKey: string) => {
  const parse = (key: string) => {
    const [year, month, day] = key.slice(0, 10).split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((parse(toKey) - parse(fromKey)) / 86_400_000);
};

export const getQuincenaRange = (yearMonth: string, half: HalfMonth) => {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;

  if (monthIndex < 0 || monthIndex > 11) {
    return null;
  }

  const startDate = new Date(year, monthIndex, half === "first" ? 1 : 16);
  const endDate = half === "first" ? new Date(year, monthIndex, 15) : new Date(year, monthIndex + 1, 0);

  return { startKey: toDateKey(startDate), endKey: toDateKey(endDate) };
};

// --------------------------------------------------------------------- urgency
export const getUrgencyScore = (task: TaskRow, todayKey: string) => {
  if (task.status === "done") {
    return -1000;
  }
  if (task.status === "blocked") {
    return 500;
  }
  if (!task.dueDate) {
    return task.priority === "urgent" ? 320 : 150;
  }

  const daysLeft = daysBetweenKeys(todayKey, task.dueDate);

  if (daysLeft < 0) {
    return 450 + Math.abs(daysLeft);
  }
  if (daysLeft === 0) {
    return 420;
  }
  if (daysLeft <= 2) {
    return 360 - daysLeft * 10;
  }
  return 220 - daysLeft;
};

export const sortByUrgency = (tasks: TaskRow[], todayKey: string) =>
  tasks.slice().sort((a, b) => getUrgencyScore(b, todayKey) - getUrgencyScore(a, todayKey));

/** Traffic light shown next to each task. */
export const taskDueSemaforo = (task: TaskRow, todayKey: string) => {
  if (task.status === "done") {
    if (task.completionOutcome === "not_completed") {
      return { label: "No completada", dotClass: "bg-red-500", textClass: "text-red-600" };
    }
    return { label: "Finalizada", dotClass: "bg-emerald-500", textClass: "text-emerald-600" };
  }

  if (!task.dueDate) {
    return { label: "Sin fecha", dotClass: "bg-slate-400", textClass: "text-slate-600" };
  }

  const daysLeft = daysBetweenKeys(todayKey, task.dueDate);

  if (daysLeft < 0) {
    return { label: `Atrasada (${Math.abs(daysLeft)}d)`, dotClass: "bg-red-500", textClass: "text-red-600" };
  }
  if (daysLeft <= 2) {
    return { label: `Crítica (${daysLeft}d)`, dotClass: "bg-red-500", textClass: "text-red-600" };
  }
  if (daysLeft <= 5) {
    return { label: `Atención (${daysLeft}d)`, dotClass: "bg-amber-500", textClass: "text-amber-600" };
  }
  return { label: `En tiempo (${daysLeft}d)`, dotClass: "bg-emerald-500", textClass: "text-emerald-600" };
};

// -------------------------------------------------------------------- filters
export const normalizeAcademy = (value: string) => value.trim().toLocaleLowerCase("es");

export type TaskFilters = {
  showDoneTasks: boolean;
  canManagePlanning: boolean;
  search: string;
  selectedSpecialty: string;
  selectedAcademy: string;
  selectedProjectId: string;
  selectedAssigneeId: string;
  showAllActivityQuincenas: boolean;
  activityRange: { startKey: string; endKey: string } | null;
};

/** Visible tasks: managers/leads filter by planning fields, workers just search. Open ones first. */
export const filterTasks = (tasks: TaskRow[], projects: ProjectRow[], filters: TaskFilters) => {
  const result = tasks.filter((task) => {
    const byDoneStatus = filters.showDoneTasks || task.status !== "done";

    if (filters.canManagePlanning) {
      const project = projects.find((item) => item.id === task.projectId);
      const bySpecialty =
        filters.selectedSpecialty.length === 0 || project?.scope === filters.selectedSpecialty;
      const byAcademy =
        filters.selectedAcademy.length === 0 ||
        (!!project && normalizeAcademy(project.code) === filters.selectedAcademy);
      const byProject =
        filters.selectedProjectId.length === 0 || task.projectId === filters.selectedProjectId;
      const byAssignee =
        filters.selectedAssigneeId.length === 0 ||
        (filters.selectedAssigneeId === UNASSIGNED_SENTINEL
          ? !task.assigneeId
          : task.assigneeId === filters.selectedAssigneeId);
      const byActivityQuincena =
        filters.selectedAssigneeId.length === 0 ||
        filters.showAllActivityQuincenas ||
        (!!filters.activityRange &&
          !!task.dueDate &&
          task.dueDate >= filters.activityRange.startKey &&
          task.dueDate <= filters.activityRange.endKey);

      return bySpecialty && byAcademy && byProject && byAssignee && byActivityQuincena && byDoneStatus;
    }

    const bySearch =
      filters.search.trim().length === 0 ||
      task.code.toLowerCase().includes(filters.search.toLowerCase()) ||
      task.title.toLowerCase().includes(filters.search.toLowerCase());

    return !!task.assigneeId && bySearch && byDoneStatus;
  });

  return result.sort((a, b) => Number(a.status === "done") - Number(b.status === "done"));
};

/** Academies (project codes) of the active projects in the chosen specialty. */
export const listAvailableAcademies = (projects: ProjectRow[], selectedSpecialty: string) => {
  const academyLabels = new Map<string, string>();
  projects
    .filter(
      (project) =>
        project.status === "active" && selectedSpecialty.length > 0 && project.scope === selectedSpecialty,
    )
    .forEach((project) => {
      const label = project.code.trim();
      const key = normalizeAcademy(label);
      const currentLabel = academyLabels.get(key);
      if (!currentLabel || (currentLabel === currentLabel.toUpperCase() && label !== label.toUpperCase())) {
        academyLabels.set(key, label);
      }
    });

  return [...academyLabels.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((left, right) => left.label.localeCompare(right.label, "es"));
};

export const filterActiveProjects = (
  projects: ProjectRow[],
  tasks: TaskRow[],
  filters: { selectedSpecialty: string; selectedAcademy: string; selectedAssigneeId: string },
) =>
  projects.filter(
    (project) =>
      project.status === "active" &&
      (filters.selectedSpecialty.length === 0 || project.scope === filters.selectedSpecialty) &&
      (filters.selectedAcademy.length === 0 || normalizeAcademy(project.code) === filters.selectedAcademy) &&
      (filters.selectedAssigneeId.length === 0 ||
        tasks.some(
          (task) =>
            task.projectId === project.id &&
            (filters.selectedAssigneeId === UNASSIGNED_SENTINEL
              ? !task.assigneeId
              : task.assigneeId === filters.selectedAssigneeId),
        )),
  );

export type PersonCount = { id: string; count: number; label: string };

const personLabel = (users: UserRow[], userId: string) => {
  const user = users.find((item) => item.id === userId);
  return user ? `${user.fullName} (${roleLabels[user.role] ?? user.role})` : userId.slice(0, 8);
};

const countByAssignee = (tasks: TaskRow[]) => {
  const counts = new Map<string, number>();
  let unassignedCount = 0;
  tasks.forEach((task) => {
    if (!task.assigneeId) {
      unassignedCount += 1;
      return;
    }
    counts.set(task.assigneeId, (counts.get(task.assigneeId) ?? 0) + 1);
  });
  return { counts, unassignedCount };
};

/** People with tasks in one project, busiest first; "Sin asignar" last. */
export const peopleForProject = (tasks: TaskRow[], users: UserRow[], projectId: string): PersonCount[] => {
  if (!projectId) {
    return [];
  }

  const { counts, unassignedCount } = countByAssignee(tasks.filter((task) => task.projectId === projectId));
  const people = [...counts.entries()]
    .map(([userId, count]) => ({ id: userId, count, label: personLabel(users, userId) }))
    .sort((a, b) => b.count - a.count);

  if (unassignedCount > 0) {
    people.push({ id: UNASSIGNED_SENTINEL, count: unassignedCount, label: "Sin asignar" });
  }
  return people;
};

/** People with tasks in the chosen specialty/academy, busiest first (ties by name). */
export const countPeopleWithTasks = (
  tasks: TaskRow[],
  projects: ProjectRow[],
  users: UserRow[],
  filters: { selectedSpecialty: string; selectedAcademy: string },
): PersonCount[] => {
  const inScope = tasks.filter((task) => {
    const project = projects.find((item) => item.id === task.projectId);
    if (filters.selectedSpecialty.length > 0 && project?.scope !== filters.selectedSpecialty) {
      return false;
    }
    if (
      filters.selectedAcademy.length > 0 &&
      (!project || normalizeAcademy(project.code) !== filters.selectedAcademy)
    ) {
      return false;
    }
    return true;
  });

  const { counts, unassignedCount } = countByAssignee(inScope);
  const people = [...counts.entries()]
    .map(([userId, count]) => ({ id: userId, count, label: personLabel(users, userId) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));

  if (unassignedCount > 0) {
    people.push({ id: UNASSIGNED_SENTINEL, count: unassignedCount, label: "Sin asignar" });
  }
  return people;
};

/** Follow-up tasks grouped under the task they continue, by due date then code. */
export const groupConsequentTasks = (tasks: TaskRow[]) =>
  tasks.reduce<Record<string, TaskRow[]>>((accumulator, task) => {
    if (!task.parentTaskId) {
      return accumulator;
    }

    if (!accumulator[task.parentTaskId]) {
      accumulator[task.parentTaskId] = [];
    }

    accumulator[task.parentTaskId].push(task);
    accumulator[task.parentTaskId].sort((left, right) => {
      const leftDate = left.dueDate ?? "9999-12-31";
      const rightDate = right.dueDate ?? "9999-12-31";
      return leftDate.localeCompare(rightDate) || left.code.localeCompare(right.code);
    });
    return accumulator;
  }, {});

// ---------------------------------------------------------------- worker panel
export const computeWorkerKpis = (visibleTasks: TaskRow[], todayKey: string) => {
  const total = visibleTasks.length;
  const done = visibleTasks.filter(
    (task) => task.status === "done" && task.completionOutcome !== "not_completed",
  ).length;

  return {
    total,
    done,
    doing: visibleTasks.filter((task) => task.status === "doing").length,
    blocked: visibleTasks.filter((task) => task.status === "blocked").length,
    dueToday: visibleTasks.filter((task) => task.status !== "done" && task.dueDate === todayKey).length,
    progress: total > 0 ? Math.round((done / total) * 100) : 0,
    active: total - done,
  };
};

/** The four open tasks that need attention first. */
export const pickPriorityTasks = (visibleTasks: TaskRow[], todayKey: string) =>
  sortByUrgency(
    visibleTasks.filter((task) => task.status !== "done"),
    todayKey,
  ).slice(0, 4);

export const buildWorkerTimeline = (visibleTasks: TaskRow[], todayKey: string) => {
  const tomorrowKey = addDaysToKey(todayKey, 1);
  const active = visibleTasks.filter((task) => task.status !== "done" && !!task.dueDate);

  return {
    overdue: active
      .filter((task) => (task.dueDate ?? "") < todayKey)
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "")),
    today: sortByUrgency(
      active.filter((task) => task.dueDate === todayKey),
      todayKey,
    ),
    tomorrow: sortByUrgency(
      active.filter((task) => task.dueDate === tomorrowKey),
      todayKey,
    ),
  };
};

/** The list the page shows: focus mode hides finished tasks; most urgent first. */
export const buildDisplayTasks = (visibleTasks: TaskRow[], focusMode: boolean, todayKey: string) =>
  sortByUrgency(focusMode ? visibleTasks.filter((task) => task.status !== "done") : visibleTasks, todayKey);

// Names used by the page.
export { getUrgencyScore as urgencyScore, taskDueSemaforo as dueSemaforo };
