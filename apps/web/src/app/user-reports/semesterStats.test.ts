import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bandFor, buildTeamStats, percentileRank, profileFor, summarize } from "./semesterStats.ts";

const close = (actual: number | null | undefined, expected: number) =>
  assert.ok(actual !== null && actual !== undefined && Math.abs(actual - expected) < 1e-6, `${actual} ≠ ${expected}`);

describe("summarize", () => {
  it("computes mean, median and sample standard deviation", () => {
    const summary = summarize([2, 4, 4, 4, 5, 5, 7, 9]);
    assert.ok(summary);
    close(summary.mean, 5);
    close(summary.median, 4.5);
    close(summary.stdDev, Math.sqrt(32 / 7));
    assert.equal(summary.min, 2);
    assert.equal(summary.max, 9);
  });

  it("handles one value and empty input", () => {
    assert.equal(summarize([80])?.stdDev, 0);
    assert.equal(summarize([]), null);
  });
});

describe("bands, percentiles and profiles", () => {
  it("maps z-scores to bands", () => {
    assert.equal(bandFor(1.2), "muy_arriba");
    assert.equal(bandFor(0.5), "arriba");
    assert.equal(bandFor(0), "media");
    assert.equal(bandFor(-0.7), "abajo");
    assert.equal(bandFor(-1), "muy_abajo");
  });

  it("counts ties as half in the percentile", () => {
    close(percentileRank(10, [10, 20, 30, 40]), 12.5);
    close(percentileRank(20, [10, 20, 20, 40]), 50);
  });

  it("places people in quality × productivity quadrants", () => {
    assert.equal(profileFor(0.3, 0.2), "alto_desempeno");
    assert.equal(profileFor(-0.3, 0.2), "productivo");
    assert.equal(profileFor(0.3, -0.2), "calidad");
    assert.equal(profileFor(-0.3, -0.2), "atencion");
  });
});

describe("buildTeamStats", () => {
  const stats = buildTeamStats([
    { userId: "a", fullName: "Ana", finalGrade: 90, earnedPoints: 400, manuallyGradedCount: 1 },
    { userId: "b", fullName: "Beto", finalGrade: 80, earnedPoints: 200, manuallyGradedCount: 1 },
    { userId: "c", fullName: "Caro", finalGrade: 70, earnedPoints: 300, manuallyGradedCount: 1 },
    { userId: "d", fullName: "Dani", finalGrade: null, earnedPoints: 0, manuallyGradedCount: 0 },
    { userId: "e", fullName: "Ema", finalGrade: 0, earnedPoints: 0, manuallyGradedCount: 1 },
  ]);

  it("scores points against the top performer and the group mean", () => {
    const ana = stats.rows.find((row) => row.userId === "a");
    const beto = stats.rows.find((row) => row.userId === "b");
    close(ana?.pointsScore, 100);
    close(beto?.pointsScore, 50);
    close(ana?.pointsIndex, (400 / 300) * 100);
    assert.equal(ana?.pointsRank, 1);
    assert.equal(stats.totalPoints, 900);
  });

  it("leaves people without grades out of the statistics", () => {
    assert.equal(stats.excluded, 2);
    assert.equal(stats.rows.length, 3);
    assert.equal(stats.gradeSummary?.n, 3);
    close(stats.gradeSummary?.mean, 80);
    close(stats.pointsSummary?.mean, 300);
    const caro = stats.rows.find((row) => row.userId === "c");
    close(caro?.gradeDiff, -10);
    close(caro?.gradeZ, -1);
    assert.equal(caro?.gradeBand, "muy_abajo");
    assert.equal(caro?.pointsBand, "media");
    assert.equal(caro?.profile, "productivo");
    const beto = stats.rows.find((row) => row.userId === "b");
    assert.equal(beto?.profile, "calidad");
  });

  it("leaves a zero result out even when it was manually graded", () => {
    const result = buildTeamStats([
      { userId: "a", fullName: "Ana", finalGrade: 80, earnedPoints: 100, manuallyGradedCount: 1 },
      { userId: "b", fullName: "Beto", finalGrade: 0, earnedPoints: 0, manuallyGradedCount: 1 },
    ]);

    assert.equal(result.excluded, 1);
    assert.equal(result.rows.length, 1);
    assert.equal(result.gradeSummary?.mean, 80);
  });
});
