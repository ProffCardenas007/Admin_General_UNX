import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STALE_TIMER_HOURS,
  isTimerStale,
  pickMyActiveTasks,
  summarizeActiveTasks,
  timerProgress,
} from "./timer.ts";

const NOW = new Date("2026-10-14T18:00:00Z").getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const HOUR = 3_600_000;

describe("forgotten timers", () => {
  it("flags a timer running longer than the limit", () => {
    assert.equal(isTimerStale({ timerStartedAt: ago(STALE_TIMER_HOURS * HOUR + 1000) }, NOW), true);
    assert.equal(isTimerStale({ timerStartedAt: ago(STALE_TIMER_HOURS * HOUR) }, NOW), false);
    assert.equal(isTimerStale({ timerStartedAt: ago(2 * HOUR) }, NOW), false);
  });

  it("never flags a stopped timer", () => {
    assert.equal(isTimerStale({ timerStartedAt: null }, NOW), false);
    assert.equal(isTimerStale({}, NOW), false);
  });
});

describe("timer progress", () => {
  const task = (over: Record<string, unknown> = {}) => ({
    estimatedHours: "2",
    authorizedExtraHours: "0",
    activeSeconds: 0,
    timerStartedAt: null as string | null,
    ...over,
  });

  it("uses saved plus running time against the authorized hours", () => {
    const p = timerProgress(task({ activeSeconds: 1800, timerStartedAt: ago(1800_000) }), NOW);
    assert.equal(p.usedSeconds, 3600);
    assert.equal(p.limitSeconds, 7200);
    assert.equal(p.percent, 50);
    assert.equal(p.over, false);
  });

  it("caps the bar at 100% but still reports going over", () => {
    const p = timerProgress(task({ activeSeconds: 3 * 3600 }), NOW);
    assert.equal(p.percent, 100);
    assert.equal(p.over, true);
  });

  it("counts approved extra hours in the limit", () => {
    const p = timerProgress(task({ activeSeconds: 3 * 3600, authorizedExtraHours: "2" }), NOW);
    assert.equal(p.limitSeconds, 4 * 3600);
    assert.equal(p.percent, 75);
    assert.equal(p.over, false);
  });

  it("shows no bar and never 'over' for a task without an estimate", () => {
    const p = timerProgress(task({ estimatedHours: "0", activeSeconds: 99999 }), NOW);
    assert.equal(p.percent, 0);
    assert.equal(p.over, false);
  });
});

describe("my active tasks", () => {
  const t = (id: string, status: string, over: Record<string, unknown> = {}) => ({
    id,
    title: id,
    status: status as "doing",
    assigneeId: "me",
    activeSeconds: 0,
    timerStartedAt: null as string | null,
    ...over,
  });

  it("keeps only my tasks that are running or paused, running first, then by title", () => {
    const list = pickMyActiveTasks(
      [
        t("zeta", "paused"),
        t("alfa", "paused"),
        t("beta", "doing"),
        t("done", "done"),
        t("todo", "todo"),
        t("blocked", "blocked"),
        t("other", "doing", { assigneeId: "someone-else" }),
        t("nobody", "doing", { assigneeId: undefined }),
      ],
      "me",
    );
    assert.deepEqual(list.map((x) => x.id), ["beta", "alfa", "zeta"]);
  });

  it("returns nothing without a signed-in user", () => {
    assert.deepEqual(pickMyActiveTasks([t("a", "doing", { assigneeId: undefined })], ""), []);
  });

  it("totals the saved and running time and counts each state", () => {
    const summary = summarizeActiveTasks(
      [
        t("a", "doing", { activeSeconds: 600, timerStartedAt: ago(300_000) }),
        t("b", "paused", { activeSeconds: 1200 }),
      ],
      NOW,
    );
    assert.deepEqual(summary, { running: 1, paused: 1, totalSeconds: 600 + 300 + 1200 });
  });

  it("handles an empty list", () => {
    assert.deepEqual(summarizeActiveTasks([], NOW), { running: 0, paused: 0, totalSeconds: 0 });
  });
});
