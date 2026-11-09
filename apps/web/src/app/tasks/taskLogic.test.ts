import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDaysToKey,
  buildDisplayTasks,
  buildWorkerTimeline,
  computeWorkerKpis,
  daysBetweenKeys,
  filterActiveProjects,
  filterTasks,
  getQuincenaRange,
  getUrgencyScore,
  groupConsequentTasks,
  listAvailableAcademies,
  peopleForProject,
  countPeopleWithTasks,
  pickPriorityTasks,
  taskDueSemaforo,
  toDateKey,
  type TaskFilters,
} from "./taskLogic.ts";
import {
  authorizedHoursFor,
  formatActiveDuration,
  formatClock,
  isTimerOvertime,
  totalTimerSeconds,
} from "./timer.ts";
import type { ProjectRow, TaskRow, UserRow } from "./types.ts";

const TODAY = "2026-10-14";

const task = (overrides: Partial<TaskRow> = {}): TaskRow => ({
  id: "t1",
  code: "EDI-001",
  activityType: "edicion",
  title: "Editar video",
  projectId: "p1",
  status: "todo",
  priority: "medium",
  dueDate: TODAY,
  estimatedHours: "2",
  ...overrides,
});

const project = (overrides: Partial<ProjectRow> = {}): ProjectRow => ({
  id: "p1",
  code: "ACA-1",
  name: "Curso Álgebra",
  status: "active",
  ...overrides,
});

const user = (overrides: Partial<UserRow> = {}): UserRow => ({ id: "u1", fullName: "Ana", role: "worker", ...overrides });

const baseFilters: TaskFilters = {
  showDoneTasks: false,
  canManagePlanning: true,
  search: "",
  selectedSpecialty: "",
  selectedAcademy: "",
  selectedProjectId: "",
  selectedAssigneeId: "",
  showAllActivityQuincenas: false,
  activityRange: null,
};

describe("calendar days", () => {
  it("counts whole days between date keys", () => {
    assert.equal(daysBetweenKeys("2026-10-14", "2026-10-14"), 0);
    assert.equal(daysBetweenKeys("2026-10-14", "2026-10-15"), 1);
    assert.equal(daysBetweenKeys("2026-10-14", "2026-10-13"), -1);
    assert.equal(daysBetweenKeys("2026-10-30", "2026-11-02"), 3);
  });

  it("ignores daylight-saving changes", () => {
    assert.equal(daysBetweenKeys("2026-03-07", "2026-03-09"), 2);
    assert.equal(daysBetweenKeys("2026-10-31", "2026-11-02"), 2);
  });

  it("accepts ISO timestamps from the API", () => {
    assert.equal(daysBetweenKeys("2026-10-14", "2026-10-13T00:00:00.000Z"), -1);
  });

  it("adds days across month ends", () => {
    assert.equal(addDaysToKey("2026-12-31", 1), "2027-01-01");
    assert.equal(toDateKey(new Date(2026, 9, 14, 23, 59)), "2026-10-14");
  });

  it("builds the two quincena ranges of a month", () => {
    assert.deepEqual(getQuincenaRange("2026-10", "first"), { startKey: "2026-10-01", endKey: "2026-10-15" });
    assert.deepEqual(getQuincenaRange("2026-02", "second"), { startKey: "2026-02-16", endKey: "2026-02-28" });
    assert.equal(getQuincenaRange("2026-13", "first"), null);
    assert.equal(getQuincenaRange("bad", "first"), null);
  });
});

describe("due-date traffic light", () => {
  const label = (dueDate: string | undefined, overrides: Partial<TaskRow> = {}) =>
    taskDueSemaforo(task({ dueDate, ...overrides }), TODAY).label;

  it("a task due TODAY is critical with 0 days left, not 1", () => {
    assert.equal(label("2026-10-14"), "Crítica (0d)");
  });

  it("a task due YESTERDAY is late by 1 day, not 'critical 0d'", () => {
    assert.equal(label("2026-10-13"), "Atrasada (1d)");
    assert.equal(label("2026-10-04"), "Atrasada (10d)");
  });

  it("grades the remaining days", () => {
    assert.equal(label("2026-10-16"), "Crítica (2d)");
    assert.equal(label("2026-10-17"), "Atención (3d)");
    assert.equal(label("2026-10-19"), "Atención (5d)");
    assert.equal(label("2026-10-20"), "En tiempo (6d)");
  });

  it("handles finished tasks and missing dates", () => {
    assert.equal(label("2026-01-01", { status: "done" }), "Finalizada");
    assert.equal(label("2026-01-01", { status: "done", completionOutcome: "not_completed" }), "No completada");
    assert.equal(label(undefined), "Sin fecha");
  });
});

describe("urgency score", () => {
  const score = (overrides: Partial<TaskRow>) => getUrgencyScore(task(overrides), TODAY);

  it("ranks overdue above due-today above due-soon above later", () => {
    const overdue = score({ dueDate: "2026-10-13" });
    const today = score({ dueDate: "2026-10-14" });
    const soon = score({ dueDate: "2026-10-15" });
    const later = score({ dueDate: "2026-10-30" });
    assert.ok(overdue > today && today > soon && soon > later, `${overdue} ${today} ${soon} ${later}`);
  });

  it("treats yesterday as overdue, not as due today", () => {
    assert.equal(score({ dueDate: "2026-10-14" }), 420);
    assert.equal(score({ dueDate: "2026-10-13" }), 451);
  });

  it("puts blocked first, finished last and undated by priority", () => {
    assert.equal(score({ status: "blocked" }), 500);
    assert.equal(score({ status: "done" }), -1000);
    assert.equal(score({ dueDate: undefined, priority: "urgent" }), 320);
    assert.equal(score({ dueDate: undefined }), 150);
  });
});

describe("task filters", () => {
  const projects = [
    project({ id: "p1", code: "ACA-1", scope: "edicion" as never }),
    project({ id: "p2", code: "aca-1", scope: "edicion" as never }),
    project({ id: "p3", code: "FIS-2", scope: "creacion" as never }),
  ];
  const tasks = [
    task({ id: "a", projectId: "p1", assigneeId: "u1", dueDate: "2026-10-05" }),
    task({ id: "b", projectId: "p3", assigneeId: "u2", dueDate: "2026-10-20" }),
    task({ id: "c", projectId: "p1", status: "done", dueDate: "2026-10-01" }),
    task({ id: "d", projectId: "p2" }),
  ];
  const ids = (list: TaskRow[]) => list.map((t) => t.id);

  it("hides finished tasks unless asked, and lists open ones first", () => {
    assert.deepEqual(ids(filterTasks(tasks, projects, baseFilters)), ["a", "b", "d"]);
    assert.deepEqual(ids(filterTasks(tasks, projects, { ...baseFilters, showDoneTasks: true })), ["a", "b", "d", "c"]);
  });

  it("filters by specialty, academy (case-insensitive), project and assignee", () => {
    assert.deepEqual(ids(filterTasks(tasks, projects, { ...baseFilters, selectedSpecialty: "creacion" })), ["b"]);
    assert.deepEqual(ids(filterTasks(tasks, projects, { ...baseFilters, selectedAcademy: "aca-1" })), ["a", "d"]);
    assert.deepEqual(ids(filterTasks(tasks, projects, { ...baseFilters, selectedProjectId: "p3" })), ["b"]);
    const anyQuincena = { ...baseFilters, showAllActivityQuincenas: true };
    assert.deepEqual(ids(filterTasks(tasks, projects, { ...anyQuincena, selectedAssigneeId: "u2" })), ["b"]);
    assert.deepEqual(ids(filterTasks(tasks, projects, { ...anyQuincena, selectedAssigneeId: "__unassigned__" })), ["d"]);
  });

  it("limits a chosen person to the selected quincena unless showing all", () => {
    const range = { startKey: "2026-10-01", endKey: "2026-10-15" };
    const withPerson = { ...baseFilters, selectedAssigneeId: "u1", activityRange: range };
    assert.deepEqual(ids(filterTasks(tasks, projects, withPerson)), ["a"]);
    assert.deepEqual(
      ids(filterTasks(tasks, projects, { ...withPerson, activityRange: { startKey: "2026-11-01", endKey: "2026-11-15" } })),
      [],
    );
    assert.deepEqual(ids(filterTasks(tasks, projects, { ...withPerson, showAllActivityQuincenas: true })), ["a"]);
  });

  it("workers only search by code or title", () => {
    const worker = { ...baseFilters, canManagePlanning: false };
    assert.deepEqual(ids(filterTasks([task({ id: "x", title: "Guion final", assigneeId: "u1" }), task({ id: "y", code: "REV-9", assigneeId: "u1" })], projects, { ...worker, search: "guion" })), ["x"]);
    assert.deepEqual(ids(filterTasks([task({ id: "x", assigneeId: "u1" }), task({ id: "y", code: "REV-9", assigneeId: "u1" })], projects, { ...worker, search: "rev-9" })), ["y"]);
  });

  it("keeps unassigned tasks out of the worker table because they appear in the available section", () => {
    const worker = { ...baseFilters, canManagePlanning: false };
    assert.deepEqual(
      ids(filterTasks([task({ id: "mine", assigneeId: "u1" }), task({ id: "available" })], projects, worker)),
      ["mine"],
    );
  });

  it("lists academies of active projects in the chosen specialty, preferring the mixed-case label", () => {
    assert.deepEqual(listAvailableAcademies(projects, "edicion"), [{ key: "aca-1", label: "aca-1" }]);
    assert.deepEqual(listAvailableAcademies(projects, ""), []);
    assert.deepEqual(
      listAvailableAcademies([project({ code: "Mate", scope: "edicion" as never }), project({ id: "p9", code: "MATE", scope: "edicion" as never })], "edicion"),
      [{ key: "mate", label: "Mate" }],
    );
  });

  it("keeps only active projects that match and have tasks for the chosen person", () => {
    const all = [...projects, project({ id: "p4", status: "done" })];
    assert.deepEqual(
      filterActiveProjects(all, tasks, { selectedSpecialty: "", selectedAcademy: "", selectedAssigneeId: "u2" }).map((p) => p.id),
      ["p3"],
    );
    assert.equal(
      filterActiveProjects(all, tasks, { selectedSpecialty: "", selectedAcademy: "", selectedAssigneeId: "" }).length,
      3,
    );
  });
});

describe("people lists", () => {
  const users = [user({ id: "u1", fullName: "Ana", role: "lead" }), user({ id: "u2", fullName: "Beto" })];
  const projects = [project({ id: "p1" }), project({ id: "p2", code: "OTRO" })];
  const tasks = [
    task({ id: "1", projectId: "p1", assigneeId: "u2" }),
    task({ id: "2", projectId: "p1", assigneeId: "u2" }),
    task({ id: "3", projectId: "p1", assigneeId: "u1" }),
    task({ id: "4", projectId: "p1" }),
    task({ id: "5", projectId: "p2", assigneeId: "u1" }),
  ];

  it("counts people in one project, busiest first, unassigned last", () => {
    assert.deepEqual(peopleForProject(tasks, users, "p1"), [
      { id: "u2", count: 2, label: "Beto (colaborador)" },
      { id: "u1", count: 1, label: "Ana (líder)" },
      { id: "__unassigned__", count: 1, label: "Sin asignar" },
    ]);
    assert.deepEqual(peopleForProject(tasks, users, ""), []);
  });

  it("counts people across projects and breaks ties by name", () => {
    const result = countPeopleWithTasks(tasks, projects, users, { selectedSpecialty: "", selectedAcademy: "" });
    assert.deepEqual(result.map((p) => [p.id, p.count]), [["u1", 2], ["u2", 2], ["__unassigned__", 1]]);
  });

  it("falls back to a short id for unknown users", () => {
    const [person] = peopleForProject([task({ assigneeId: "abcdef1234567" })], [], "p1");
    assert.equal(person.label, "abcdef12");
  });
});

describe("follow-up tasks", () => {
  it("groups children under their parent, by due date then code", () => {
    const grouped = groupConsequentTasks([
      task({ id: "c1", parentTaskId: "p", dueDate: "2026-10-20", code: "B" }),
      task({ id: "c2", parentTaskId: "p", dueDate: "2026-10-10", code: "Z" }),
      task({ id: "c3", parentTaskId: "p", dueDate: "2026-10-10", code: "A" }),
      task({ id: "x" }),
    ]);
    assert.deepEqual(grouped.p.map((t) => t.id), ["c3", "c2", "c1"]);
    assert.equal(Object.keys(grouped).length, 1);
  });
});

describe("worker panel", () => {
  const tasks = [
    task({ id: "late", dueDate: "2026-10-12", status: "doing" }),
    task({ id: "now", dueDate: TODAY, priority: "urgent" }),
    task({ id: "tom", dueDate: "2026-10-15" }),
    task({ id: "blk", status: "blocked", dueDate: "2026-11-30" }),
    task({ id: "ok", status: "done", dueDate: "2026-10-01" }),
    task({ id: "no", status: "done", completionOutcome: "not_completed" }),
  ];

  it("summarizes the visible tasks", () => {
    assert.deepEqual(computeWorkerKpis(tasks, TODAY), {
      total: 6,
      done: 1, // "not completed" is closed but not counted as done
      doing: 1,
      blocked: 1,
      dueToday: 1,
      progress: 17,
      active: 5,
    });
    assert.equal(computeWorkerKpis([], TODAY).progress, 0);
  });

  it("picks at most four open tasks, most urgent first", () => {
    assert.deepEqual(pickPriorityTasks(tasks, TODAY).map((t) => t.id), ["blk", "late", "now", "tom"]);
  });

  it("builds overdue / today / tomorrow lanes", () => {
    const lanes = buildWorkerTimeline(tasks, TODAY);
    assert.deepEqual(lanes.overdue.map((t) => t.id), ["late"]);
    assert.deepEqual(lanes.today.map((t) => t.id), ["now"]);
    assert.deepEqual(lanes.tomorrow.map((t) => t.id), ["tom"]);
  });

  it("focus mode hides finished tasks and the list is sorted by urgency", () => {
    assert.deepEqual(buildDisplayTasks(tasks, true, TODAY).map((t) => t.id), ["blk", "late", "now", "tom"]);
    assert.equal(buildDisplayTasks(tasks, false, TODAY).length, 6);
    assert.equal(buildDisplayTasks(tasks, false, TODAY).at(-1)?.status, "done");
  });
});

describe("timer", () => {
  const NOW = new Date("2026-10-14T12:00:00Z").getTime();

  it("formats a clock", () => {
    assert.equal(formatClock(0), "00:00:00");
    assert.equal(formatClock(3725), "01:02:05");
    assert.equal(formatClock(-5), "00:00:00");
  });

  it("adds the run in progress to the banked seconds", () => {
    const running = { activeSeconds: 600, timerStartedAt: new Date(NOW - 90_000).toISOString() };
    assert.equal(totalTimerSeconds(running, NOW), 690);
    assert.equal(totalTimerSeconds({ activeSeconds: 600, timerStartedAt: null }, NOW), 600);
    assert.equal(totalTimerSeconds({}, NOW), 0);
  });

  it("never goes negative if the clocks disagree", () => {
    assert.equal(totalTimerSeconds({ activeSeconds: 5, timerStartedAt: new Date(NOW + 60_000).toISOString() }, NOW), 5);
  });

  it("authorized hours are the estimate plus approved extras", () => {
    assert.equal(authorizedHoursFor({ estimatedHours: "4", authorizedExtraHours: "1.5" }), 5.5);
    assert.equal(authorizedHoursFor({ estimatedHours: "4" }), 4);
  });

  it("is overtime only after the authorized hours, and never without an estimate", () => {
    const base = { estimatedHours: "1", activeSeconds: 3600, timerStartedAt: null };
    assert.equal(isTimerOvertime(base, NOW), false); // exactly at the limit
    assert.equal(isTimerOvertime({ ...base, activeSeconds: 3601 }, NOW), true);
    assert.equal(isTimerOvertime({ ...base, activeSeconds: 3601, authorizedExtraHours: "1" }, NOW), false);
    assert.equal(isTimerOvertime({ estimatedHours: "0", activeSeconds: 99999, timerStartedAt: null }, NOW), false);
  });

  it("formats a short duration for the list", () => {
    assert.equal(formatActiveDuration({ activeSeconds: 4500 }, NOW), "1h 15m");
  });
});
