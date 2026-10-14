import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDaysToKey,
  buildFortnightCards,
  buildPortfolioRows,
  computeProjectKpis,
  computeTaskKpis,
  computeTeamAlerts,
  filterCardsByName,
  filterOpenTasks,
  filterPortfolioRows,
  getCurrentFortnight,
  getRiskLevel,
  groupAssignedHoursBySpecialty,
  isDueSoon,
  isOverdue,
  summarizeUserTasks,
  toLocalDateKey,
} from "./metrics.ts";
import type { ProjectRow, TaskRow, UserOption } from "./types.ts";

const task = (overrides: Partial<TaskRow> = {}): TaskRow => ({
  id: "t1",
  projectId: "p1",
  activityType: "edicion",
  title: "Editar video",
  status: "todo",
  priority: "medium",
  dueDate: "2026-10-14",
  estimatedHours: "2",
  ...overrides,
});

const user = (overrides: Partial<UserOption> = {}): UserOption => ({
  id: "u1",
  fullName: "Ana López",
  role: "worker",
  ...overrides,
});

const project = (overrides: Partial<ProjectRow> = {}): ProjectRow => ({
  id: "p1",
  code: "ACA-1",
  name: "Curso Álgebra",
  status: "active",
  ...overrides,
});

describe("dates", () => {
  it("formats the local day, never the UTC one", () => {
    // 23:30 local on the 14th must stay the 14th.
    assert.equal(toLocalDateKey(new Date(2026, 9, 14, 23, 30)), "2026-10-14");
  });

  it("adds days across month ends", () => {
    assert.equal(addDaysToKey("2026-10-30", 3), "2026-11-02");
    assert.equal(addDaysToKey("2026-12-31", 1), "2027-01-01");
  });
});

describe("overdue and due soon", () => {
  it("does not count a task due today as overdue", () => {
    assert.equal(isOverdue(task({ dueDate: "2026-10-14" }), "2026-10-14"), false);
  });

  it("counts a task due yesterday as overdue", () => {
    assert.equal(isOverdue(task({ dueDate: "2026-10-13" }), "2026-10-14"), true);
  });

  it("ignores finished tasks and tasks without a date", () => {
    assert.equal(isOverdue(task({ status: "done", dueDate: "2026-01-01" }), "2026-10-14"), false);
    assert.equal(isOverdue(task({ dueDate: undefined }), "2026-10-14"), false);
  });

  it("treats today through three days ahead as due soon", () => {
    assert.equal(isDueSoon(task({ dueDate: "2026-10-14" }), "2026-10-14"), true);
    assert.equal(isDueSoon(task({ dueDate: "2026-10-17" }), "2026-10-14"), true);
    assert.equal(isDueSoon(task({ dueDate: "2026-10-18" }), "2026-10-14"), false);
    assert.equal(isDueSoon(task({ dueDate: "2026-10-13" }), "2026-10-14"), false);
  });

  it("accepts ISO timestamps from the API", () => {
    assert.equal(isOverdue(task({ dueDate: "2026-10-13T00:00:00.000Z" }), "2026-10-14"), true);
  });
});

describe("task KPIs", () => {
  const tasks = [
    task({ id: "a", status: "doing", dueDate: "2026-10-10", priority: "urgent", assigneeId: "me" }),
    task({ id: "b", status: "blocked", dueDate: "2026-10-14", assigneeId: "me" }),
    task({ id: "c", status: "done", dueDate: "2026-10-01" }),
    task({ id: "d", status: "done", completionOutcome: "not_completed" }),
    task({ id: "e", status: "todo", dueDate: "2026-10-16" }),
  ];

  it("summarizes counts for the signed-in user", () => {
    assert.deepEqual(computeTaskKpis(tasks, "me", "2026-10-14"), {
      total: 5,
      todo: 1,
      doing: 1,
      blocked: 1,
      done: 1, // the "not completed" one is not counted as done
      urgent: 1,
      overdue: 1, // only "a"; "b" is due today
      dueSoon: 2, // "b" (today) and "e"
      myTasks: 2,
    });
  });

  it("counts nothing as mine without a signed-in user", () => {
    assert.equal(computeTaskKpis(tasks, "", "2026-10-14").myTasks, 0);
  });

  it("summarizes one person's tasks", () => {
    assert.deepEqual(summarizeUserTasks(tasks.slice(0, 3), "2026-10-14"), {
      total: 3,
      done: 1,
      blocked: 1,
      active: 2,
      urgent: 1,
      overdue: 1,
    });
  });
});

describe("projects", () => {
  it("rates risk from status, overdue tasks and completion", () => {
    const progress = (overdueTasks: number, completionRate: number) => ({
      projectId: "p1",
      totalTasks: 10,
      doneTasks: 0,
      overdueTasks,
      completionRate,
    });
    assert.equal(getRiskLevel(project({ status: "cancelled" })), "red");
    assert.equal(getRiskLevel(project({ status: "on_hold" })), "amber");
    assert.equal(getRiskLevel(project(), progress(3, 90)), "red");
    assert.equal(getRiskLevel(project(), progress(1, 90)), "amber");
    assert.equal(getRiskLevel(project(), progress(0, 39)), "amber");
    assert.equal(getRiskLevel(project(), progress(0, 40)), "green");
    assert.equal(getRiskLevel(project({ status: "planned" }), undefined), "green");
  });

  it("builds portfolio rows, filters them and computes KPIs", () => {
    const rows = buildPortfolioRows(
      [project(), project({ id: "p2", code: "ACA-2", name: "Física", scope: "edicion" as never, status: "on_hold" })],
      { p1: { projectId: "p1", totalTasks: 4, doneTasks: 4, completionRate: 100, overdueTasks: 0 } },
    );

    assert.deepEqual(rows.map((row) => row.risk), ["green", "amber"]);
    assert.deepEqual(computeProjectKpis(rows), {
      total: 2,
      active: 1,
      inRisk: 1,
      overdue: 0,
      averageCompletion: 50,
    });

    const base = { search: "", status: "" as const, specialty: "", risk: "all" as const };
    assert.equal(filterPortfolioRows(rows, { ...base, search: "fisi" }).length, 0);
    assert.equal(filterPortfolioRows(rows, { ...base, search: "física" })[0].id, "p2");
    assert.equal(filterPortfolioRows(rows, { ...base, risk: "green" })[0].id, "p1");
    assert.equal(filterPortfolioRows(rows, { ...base, status: "on_hold" })[0].id, "p2");
  });

  it("returns zeros for an empty portfolio", () => {
    assert.deepEqual(computeProjectKpis([]), {
      total: 0,
      active: 0,
      inRisk: 0,
      overdue: 0,
      averageCompletion: 0,
    });
  });
});

describe("open task list filter", () => {
  const projectsById = { p1: project(), p2: project({ id: "p2", code: "FIS-9", name: "Física" }) };
  const tasks = [
    task({ id: "a", title: "Guion", assigneeId: "u1" }),
    task({ id: "b", title: "Corte final", projectId: "p2", assigneeId: "u2", activityType: "revision" }),
  ];
  const none = { projectId: "", userId: "", search: "" };

  it("returns everything without filters", () => {
    assert.equal(filterOpenTasks(tasks, projectsById, none).length, 2);
  });

  it("filters by project, person and free text (title, activity, project name or code)", () => {
    assert.deepEqual(filterOpenTasks(tasks, projectsById, { ...none, projectId: "p2" }).map((t) => t.id), ["b"]);
    assert.deepEqual(filterOpenTasks(tasks, projectsById, { ...none, userId: "u1" }).map((t) => t.id), ["a"]);
    assert.deepEqual(filterOpenTasks(tasks, projectsById, { ...none, search: "revision" }).map((t) => t.id), ["b"]);
    assert.deepEqual(filterOpenTasks(tasks, projectsById, { ...none, search: "fis-9" }).map((t) => t.id), ["b"]);
  });
});

describe("team alerts", () => {
  const users = [
    user({ id: "idle" }),
    user({ id: "busy", fullName: "Luis" }),
    user({ id: "boss", role: "manager" }),
    user({ id: "gone", isActive: false }),
  ];
  const tasks = [
    task({ assigneeId: "busy", estimatedHours: "30" }),
    task({ id: "t2", assigneeId: "busy", estimatedHours: "15" }),
    task({ id: "t3", assigneeId: "busy", status: "done", estimatedHours: "99" }),
  ];

  it("lists people with no active tasks and people over the threshold", () => {
    const alerts = computeTeamAlerts(users, tasks, 40);
    assert.deepEqual(alerts.withoutActiveTasks.map((row) => row.user.id), ["idle"]);
    assert.deepEqual(alerts.overloaded.map((row) => [row.user.id, row.activeHours]), [["busy", 45]]);
  });

  it("does not flag managers, inactive users or finished work", () => {
    const alerts = computeTeamAlerts(users, tasks, 100);
    assert.equal(alerts.overloaded.length, 0);
    assert.ok(alerts.withoutActiveTasks.every((row) => row.user.role !== "manager" && row.user.isActive !== false));
  });
});

describe("assigned hours by specialty", () => {
  it("groups hours by project specialty, biggest first", () => {
    const projects = {
      p1: project({ scope: "edicion" as never }),
      p2: project({ id: "p2", scope: undefined }),
    };
    const rows = groupAssignedHoursBySpecialty(
      [
        task({ projectId: "p1", estimatedHours: "3" }),
        task({ id: "x", projectId: "p1", estimatedHours: "2" }),
        task({ id: "y", projectId: "p2", estimatedHours: "8" }),
        task({ id: "z", projectId: "p2", estimatedHours: "no-es-numero" }),
      ],
      projects,
      { edicion: "Edición" },
    );

    assert.deepEqual(rows, [
      { specialty: "Sin especialidad", hours: 8, tasks: 2 },
      { specialty: "Edición", hours: 5, tasks: 2 },
    ]);
  });
});

describe("fortnight", () => {
  it("uses the first half through the 15th and the second half after", () => {
    const first = getCurrentFortnight(new Date(2026, 9, 15));
    assert.equal(first.startKey, "2026-10-01");
    assert.equal(first.endKey, "2026-10-15");

    const second = getCurrentFortnight(new Date(2026, 9, 16));
    assert.equal(second.startKey, "2026-10-16");
    assert.equal(second.endKey, "2026-10-31");
  });

  it("targets 9 hours per business day", () => {
    // Oct 16-31 2026: Fri 16, 19-23, 26-30 = 11 weekdays.
    const second = getCurrentFortnight(new Date(2026, 9, 20));
    assert.equal(second.businessDays, 11);
    assert.equal(second.targetHours, 99);
  });

  it("handles short months", () => {
    assert.equal(getCurrentFortnight(new Date(2026, 1, 20)).endKey, "2026-02-28");
  });
});

describe("fortnight cards", () => {
  const fortnight = { startKey: "2026-10-01", endKey: "2026-10-15", label: "", businessDays: 10, targetHours: 90 };
  const people = [
    user({ id: "w", fullName: "Zoe" }),
    user({ id: "l", fullName: "Álvaro", role: "lead" }),
    user({ id: "off", fullName: "Baja", isActive: false }),
  ];
  const cards = buildFortnightCards({
    users: people,
    tasks: [
      task({ id: "in", assigneeId: "w", dueDate: "2026-10-05", estimatedHours: "10" }),
      task({ id: "later", assigneeId: "w", dueDate: "2026-10-20", estimatedHours: "50" }),
    ],
    classHours: [{ userId: "w", classHours: 6, sessionsCount: 3 }],
    fortnight,
  });

  it("sums only tasks due inside the fortnight plus class hours", () => {
    const zoe = cards.find((card) => card.user.id === "w")!;
    assert.equal(zoe.activityHours, 10);
    assert.equal(zoe.classHours, 6);
    assert.equal(zoe.totalHours, 16);
    assert.equal(zoe.remainingHours, 74);
    assert.equal(zoe.exceededHours, 0);
  });

  it("reports the excess when the target is passed", () => {
    const over = buildFortnightCards({
      users: [user()],
      tasks: [task({ assigneeId: "u1", dueDate: "2026-10-02", estimatedHours: "100" })],
      classHours: [],
      fortnight,
    })[0];
    assert.equal(over.exceededHours, 10);
    assert.equal(over.remainingHours, 0);
  });

  it("skips inactive users and sorts by hours, then role, then name", () => {
    assert.deepEqual(cards.map((card) => card.user.id), ["w", "l"]);
  });

  it("filters by name ignoring accents and case", () => {
    assert.deepEqual(filterCardsByName(cards, "alvaro").map((card) => card.user.id), ["l"]);
    assert.deepEqual(filterCardsByName(cards, "  ZOE ").map((card) => card.user.id), ["w"]);
    assert.equal(filterCardsByName(cards, "").length, 2);
    assert.equal(filterCardsByName(cards, "nadie").length, 0);
  });
});
