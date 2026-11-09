import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
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
