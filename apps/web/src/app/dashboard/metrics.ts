// Pure dashboard calculations. No React and no runtime imports, so they can be
// unit tested with `npm test`.
import type {
  ClassHoursRow,
  Fortnight,
  ProjectProgress,
  ProjectRow,
  RiskLevel,
  TaskRow,
  UserOption,
} from "./types";

/** Local calendar day as YYYY-MM-DD (never UTC). */
export const toLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const addDaysToKey = (dateKey: string, days: number) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return toLocalDateKey(new Date(year, month - 1, day + days));
};

export const getCurrentFortnight = (today: Date = new Date()): Fortnight => {
  const year = today.getFullYear();
  const month = today.getMonth();
  const startDay = today.getDate() <= 15 ? 1 : 16;
  const endDay = startDay === 1 ? 15 : new Date(year, month + 1, 0).getDate();
  const startDate = new Date(year, month, startDay);
  const endDate = new Date(year, month, endDay);
  const monthAndYear = endDate.toLocaleDateString("es-MX", {
    month: "long",
    year: "numeric",
  });
  let businessDays = 0;
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const day = cursor.getDay();
    if (day >= 1 && day <= 5) {
      businessDays += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    startKey: toLocalDateKey(startDate),
    endKey: toLocalDateKey(endDate),
    label: `${startDay} al ${endDay} de ${monthAndYear}`,
    businessDays,
    targetHours: businessDays * 9,
  };
};

// ---------------------------------------------------------------- task dates
// Due dates are calendar days ("2026-10-14"). They are compared as strings
// against the local day: `new Date("2026-10-14")` is midnight UTC, which in
// Mexico is still the 13th and made tasks due today look overdue.

type DatedTask = Pick<TaskRow, "status" | "dueDate">;

const dueKey = (task: DatedTask) => task.dueDate?.slice(0, 10) ?? "";

export const isOverdue = (task: DatedTask, todayKey: string) =>
  task.status !== "done" && dueKey(task) !== "" && dueKey(task) < todayKey;

export const isDueSoon = (task: DatedTask, todayKey: string, withinDays = 3) => {
  const due = dueKey(task);
  return (
    task.status !== "done" &&
    due !== "" &&
    due >= todayKey &&
    due <= addDaysToKey(todayKey, withinDays)
  );
};

const isCompleted = (task: Pick<TaskRow, "status" | "completionOutcome">) =>
  task.status === "done" && task.completionOutcome !== "not_completed";

export const computeTaskKpis = (
  tasks: TaskRow[],
  currentUserId: string,
  todayKey: string,
) => ({
  total: tasks.length,
  todo: tasks.filter((task) => task.status === "todo").length,
  doing: tasks.filter((task) => task.status === "doing").length,
  blocked: tasks.filter((task) => task.status === "blocked").length,
  done: tasks.filter(isCompleted).length,
  urgent: tasks.filter((task) => task.priority === "urgent" && task.status !== "done").length,
  overdue: tasks.filter((task) => isOverdue(task, todayKey)).length,
  dueSoon: tasks.filter((task) => isDueSoon(task, todayKey)).length,
  myTasks: currentUserId
    ? tasks.filter((task) => task.assigneeId === currentUserId && task.status !== "done").length
    : 0,
});

export const summarizeUserTasks = (userTasks: TaskRow[], todayKey: string) => ({
  total: userTasks.length,
  done: userTasks.filter(isCompleted).length,
  blocked: userTasks.filter((task) => task.status === "blocked").length,
  active: userTasks.filter((task) => task.status !== "done").length,
  urgent: userTasks.filter((task) => task.priority === "urgent" && task.status !== "done").length,
  overdue: userTasks.filter((task) => isOverdue(task, todayKey)).length,
});

// ------------------------------------------------------------------ projects
export const getRiskLevel = (project: ProjectRow, progress?: ProjectProgress): RiskLevel => {
  if (project.status === "cancelled") {
    return "red";
  }
  if (project.status === "on_hold") {
    return "amber";
  }

  const overdue = progress?.overdueTasks ?? 0;
  const completion = progress?.completionRate ?? 0;

  if (overdue >= 3) {
    return "red";
  }
  if (overdue > 0 || (project.status === "active" && completion < 40)) {
    return "amber";
  }
  return "green";
};

export type PortfolioRow = ProjectRow & {
  completionRate: number;
  overdueTasks: number;
  risk: RiskLevel;
};

export const buildPortfolioRows = (
  projects: ProjectRow[],
  progressById: Record<string, ProjectProgress>,
): PortfolioRow[] =>
  projects.map((project) => {
    const progress = progressById[project.id];
    return {
      ...project,
      completionRate: progress?.completionRate ?? 0,
      overdueTasks: progress?.overdueTasks ?? 0,
      risk: getRiskLevel(project, progress),
    };
  });

export type ProjectFilters = {
  search: string;
  status: "" | ProjectRow["status"];
  specialty: string;
  risk: "all" | RiskLevel;
};

export const filterPortfolioRows = (rows: PortfolioRow[], filters: ProjectFilters) =>
  rows.filter((project) => {
    const bySearch =
      filters.search.trim().length === 0 ||
      project.code.toLowerCase().includes(filters.search.toLowerCase()) ||
      project.name.toLowerCase().includes(filters.search.toLowerCase());
    const byStatus = filters.status.length === 0 || project.status === filters.status;
    const bySpecialty = filters.specialty.length === 0 || project.scope === filters.specialty;
    const byRisk = filters.risk === "all" || project.risk === filters.risk;

    return bySearch && byStatus && bySpecialty && byRisk;
  });

export const computeProjectKpis = (rows: PortfolioRow[]) => {
  const total = rows.length;
  return {
    total,
    active: rows.filter((project) => project.status === "active").length,
    inRisk: rows.filter((project) => project.risk !== "green").length,
    overdue: rows.reduce((sum, project) => sum + project.overdueTasks, 0),
    averageCompletion:
      total === 0
        ? 0
        : Number((rows.reduce((sum, project) => sum + project.completionRate, 0) / total).toFixed(1)),
  };
};

// --------------------------------------------------------------------- tasks
export type TaskListFilters = { projectId: string; userId: string; search: string };

export const filterOpenTasks = (
  openTasks: TaskRow[],
  projectsById: Record<string, ProjectRow>,
  filters: TaskListFilters,
) =>
  openTasks.filter((task) => {
    const project = projectsById[task.projectId];
    const query = filters.search.toLowerCase();
    const byProject = filters.projectId.length === 0 || task.projectId === filters.projectId;
    const byUser = filters.userId.length === 0 || (task.assigneeId ?? "") === filters.userId;
    const bySearch =
      filters.search.trim().length === 0 ||
      task.title.toLowerCase().includes(query) ||
      task.activityType.toLowerCase().includes(query) ||
      (project?.name ?? "").toLowerCase().includes(query) ||
      (project?.code ?? "").toLowerCase().includes(query);

    return byProject && byUser && bySearch;
  });

// ---------------------------------------------------------------------- team
export const computeTeamAlerts = (
  users: UserOption[],
  tasks: TaskRow[],
  overloadThresholdHours: number,
) => {
  const rows = users
    .filter((user) => user.role !== "manager" && user.isActive !== false)
    .map((user) => {
      const activeTasks = tasks.filter(
        (task) => task.assigneeId === user.id && task.status !== "done",
      );
      return {
        user,
        activeTasksCount: activeTasks.length,
        activeHours: activeTasks.reduce((sum, task) => sum + Number(task.estimatedHours ?? 0), 0),
      };
    });

  return {
    withoutActiveTasks: rows.filter((row) => row.activeTasksCount === 0),
    overloaded: rows
      .filter((row) => row.activeHours > overloadThresholdHours)
      .sort((a, b) => b.activeHours - a.activeHours),
  };
};

export const groupAssignedHoursBySpecialty = (
  userTasks: TaskRow[],
  projectsById: Record<string, ProjectRow>,
  specialtyLabels: Record<string, string>,
) => {
  const grouped = new Map<string, { specialty: string; hours: number; tasks: number }>();

  userTasks.forEach((task) => {
    const scope = projectsById[task.projectId]?.scope;
    const specialty = scope ? specialtyLabels[scope] : "Sin especialidad";
    const estimated = Number(task.estimatedHours ?? 0);

    const current = grouped.get(specialty) ?? { specialty, hours: 0, tasks: 0 };
    current.hours += Number.isFinite(estimated) ? estimated : 0;
    current.tasks += 1;
    grouped.set(specialty, current);
  });

  return [...grouped.values()].sort((a, b) => b.hours - a.hours);
};

// ----------------------------------------------------------------- fortnight
export const normalizeSearchText = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const buildFortnightCards = (input: {
  users: UserOption[];
  tasks: TaskRow[];
  classHours: ClassHoursRow[];
  fortnight: Fortnight;
}) => {
  const { users, tasks, classHours, fortnight } = input;
  const classHoursByUserId = Object.fromEntries(classHours.map((row) => [row.userId, row]));
  const roleOrder: Record<UserOption["role"], number> = { lead: 0, manager: 1, worker: 2 };

  return users
    .filter((user) => user.isActive !== false)
    .map((user) => {
      const activities = tasks
        .filter((task) => {
          const key = task.dueDate?.slice(0, 10) ?? "";
          return task.assigneeId === user.id && key >= fortnight.startKey && key <= fortnight.endKey;
        })
        .sort((first, second) => {
          const byDate = (first.dueDate ?? "").localeCompare(second.dueDate ?? "");
          return byDate || first.title.localeCompare(second.title, "es");
        });
      const activityHours = activities.reduce((sum, task) => {
        const hours = Number(task.estimatedHours ?? 0);
        return sum + (Number.isFinite(hours) ? hours : 0);
      }, 0);
      const classSummary = classHoursByUserId[user.id];
      const classHoursTotal = Number(classSummary?.classHours ?? 0);
      const totalHours = activityHours + classHoursTotal;

      return {
        user,
        activities,
        activityHours,
        classHours: classHoursTotal,
        classSessions: classSummary?.sessionsCount ?? 0,
        totalHours,
        remainingHours: Math.max(fortnight.targetHours - totalHours, 0),
        exceededHours: Math.max(totalHours - fortnight.targetHours, 0),
      };
    })
    .sort((first, second) => {
      if (first.totalHours !== second.totalHours) {
        return second.totalHours - first.totalHours;
      }
      if (first.user.role !== second.user.role) {
        return roleOrder[first.user.role] - roleOrder[second.user.role];
      }
      return first.user.fullName.localeCompare(second.user.fullName, "es");
    });
};

export type FortnightCard = ReturnType<typeof buildFortnightCards>[number];

/** Accent- and case-insensitive filter on the person's name. */
export const filterCardsByName = (cards: FortnightCard[], search: string) => {
  const query = normalizeSearchText(search.trim());
  if (!query) {
    return cards;
  }
  return cards.filter(({ user }) => normalizeSearchText(user.fullName).includes(query));
};
