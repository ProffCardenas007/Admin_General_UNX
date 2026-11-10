import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildWorkDistribution,
  isTaskInPeriod,
  reportTaskHours,
  groupHoursByLabel,
  normalizeDistributionLabel,
} from "./reportLogic.ts";

describe("report distribution labels", () => {
  it("normalizes case, whitespace and equivalent Unicode accents", () => {
    assert.equal(normalizeDistributionLabel("  ESPAÑOL   - PAA "), "español - paa");
    assert.equal(normalizeDistributionLabel("Espan\u0303ol - PAA"), "español - paa");
  });

  it("combines equivalent labels and keeps the readable capitalization", () => {
    assert.deepEqual(
      groupHoursByLabel([
        { label: "ESPAÑOL - PAA", hours: 16 },
        { label: "Español - PAA", hours: 48 },
        { label: "Español - UNAM", hours: 8 },
      ]),
      [
        { label: "Español - PAA", hours: 64 },
        { label: "Español - UNAM", hours: 8 },
      ],
    );
  });

  it("treats invalid hours as zero", () => {
    assert.deepEqual(groupHoursByLabel([{ label: "Español - PAA", hours: Number.NaN }]), [
      { label: "Español - PAA", hours: 0 },
    ]);
  });
});

describe("work distribution for the expense report", () => {
  const distribution = buildWorkDistribution([
    { kind: "Clases", program: "PAA", subject: "Matemáticas", hours: 20, count: 8 },
    { kind: "Clases", program: "PAA", subject: "MATEMATICAS", hours: 5, count: 2 },
    { kind: "Tareas", program: "PAA", subject: "Matemáticas", hours: 15, count: 3 },
    { kind: "Clases", program: "EXANI-II", subject: "Español", hours: 10, count: 4 },
    { kind: "Tareas", program: "PAA", subject: "Inglés", hours: 50, count: 6 },
    { kind: "Tareas", program: "PAA", subject: "Inglés", hours: Number.NaN, count: 1 },
  ]);

  it("merges equivalent subjects and keeps readable labels", () => {
    const paaMathClasses = distribution.rows.find((row) => row.kind === "Clases" && row.program === "PAA");
    assert.equal(paaMathClasses?.subject, "Matemáticas");
    assert.equal(paaMathClasses?.hours, 25);
    assert.equal(paaMathClasses?.count, 10);
  });

  it("computes percentages over total and per kind", () => {
    assert.equal(distribution.totalHours, 100);
    assert.equal(distribution.classHours, 35);
    assert.equal(distribution.taskHours, 65);
    const paaMathTasks = distribution.rows.find((row) => row.kind === "Tareas" && row.subject === "Matemáticas");
    assert.equal(paaMathTasks?.pctOfTotal, 15);
    assert.ok(Math.abs((paaMathTasks?.pctOfKind ?? 0) - (15 / 65) * 100) < 1e-9);
    const sum = distribution.rows.reduce((acc, row) => acc + row.pctOfTotal, 0);
    assert.ok(Math.abs(sum - 100) < 1e-9);
  });

  it("orders by area and lists classes before tasks within an area", () => {
    assert.deepEqual(
      distribution.rows.map((row) => `${row.kind} ${row.program} ${row.subject}`),
      [
        "Tareas PAA Inglés",
        "Clases PAA Matemáticas",
        "Tareas PAA Matemáticas",
        "Clases EXANI-II Español",
      ],
    );
    assert.deepEqual(
      distribution.areas.map((area) => [area.subject, area.classHours, area.taskHours, area.pctOfTotal]),
      [
        ["Inglés", 0, 50, 50],
        ["Matemáticas", 25, 15, 40],
        ["Español", 10, 0, 10],
      ],
    );
  });
});

describe("tasks in the fortnight", () => {
  const range = { startKey: "2026-11-01", endKey: "2026-11-15" };

  it("uses the due date, inclusive on both ends", () => {
    assert.equal(isTaskInPeriod({ dueDate: "2026-11-01" }, range), true);
    assert.equal(isTaskInPeriod({ dueDate: "2026-11-15" }, range), true);
    assert.equal(isTaskInPeriod({ dueDate: "2026-11-16" }, range), false);
    assert.equal(isTaskInPeriod({ dueDate: "2026-10-31", createdAt: "2026-11-05T10:00:00" }, range), false);
  });

  it("falls back to the creation date when there is no due date", () => {
    assert.equal(isTaskInPeriod({ createdAt: "2026-11-05T10:00:00" }, range), true);
    assert.equal(isTaskInPeriod({ createdAt: "2026-11-20T10:00:00" }, range), false);
    assert.equal(isTaskInPeriod({}, range), false);
  });
});

describe("task hours for the management report", () => {
  const nowMs = new Date("2026-11-10T12:00:00Z").getTime();

  it("uses the estimate when the timer was never used", () => {
    assert.deepEqual(reportTaskHours({ estimatedHours: "8.00", activeSeconds: 0 }, nowMs), {
      hours: 8,
      source: "estimate",
    });
    assert.deepEqual(reportTaskHours({ estimatedHours: null }, nowMs), { hours: 0, source: "estimate" });
  });

  it("uses the timer once it has time, even if it differs from the estimate", () => {
    assert.deepEqual(reportTaskHours({ estimatedHours: "8.00", activeSeconds: 3 * 3600 }, nowMs), {
      hours: 3,
      source: "timer",
    });
  });

  it("adds the running stretch of a timer that is on", () => {
    const task = { estimatedHours: "8.00", activeSeconds: 3600, timerStartedAt: "2026-11-10T11:30:00Z" };
    assert.deepEqual(reportTaskHours(task, nowMs), { hours: 1.5, source: "timer" });
    const firstRun = { estimatedHours: "8.00", activeSeconds: 0, timerStartedAt: "2026-11-10T11:00:00Z" };
    assert.deepEqual(reportTaskHours(firstRun, nowMs), { hours: 1, source: "timer" });
  });
});
