// Verifies the standard default family is wired correctly to the model.
import { describe, it, expect } from "vitest";
import { computeFamily, referenceLD } from "../leverModel";
import { STANDARD_HEM_ANCHOR } from "../standardCalibration";
import helicalH45AL3 from "./helicalH45AL3";

describe("Helical H45AL-3 standard seed family", () => {
  it("computes across the L/D grid for every diameter", () => {
    const rows = computeFamily(helicalH45AL3);
    expect(rows.length).toBe(14); // 1.5..8.0 step 0.5
    for (const r of rows) {
      expect(r.perDiameter.length).toBe(helicalH45AL3.diameters.length);
    }
  });

  it("anchor row (L/D 2.5) returns the standard ae0/fz0 with 'anchor' status", () => {
    expect(referenceLD(STANDARD_HEM_ANCHOR)).toBeCloseTo(2.5, 9);
    const anchor = computeFamily(helicalH45AL3).find((r) => Math.abs(r.ld - 2.5) < 1e-9)!;
    expect(anchor.status).toBe("anchor");
    expect(anchor.radialPct).toBeCloseTo(STANDARD_HEM_ANCHOR.radialPct, 9);
    expect(anchor.chipLoadPct).toBeCloseTo(STANDARD_HEM_ANCHOR.chipLoadPct, 9);
  });

  it("derates radial monotonically from the anchor out to the longest tools", () => {
    const rows = computeFamily(helicalH45AL3).filter((r) => r.ld >= 2.5);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].radialPct).toBeLessThanOrEqual(rows[i - 1].radialPct + 1e-12);
    }
  });
});
