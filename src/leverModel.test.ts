// leverModel.test.ts — acceptance + property tests for the pure lever model (spec §9).
import { describe, it, expect } from "vitest";
import {
  type ToolFamily,
  type Calibration,
  type ModelKnobs,
  type Derate3Anchor,
  type Derate3Bounds,
  referenceLD,
  allocate,
  derate3,
  computeRow,
  computeFamily,
} from "./leverModel";

// The validated anchor tool from spec §9: a 0.25" tool at 0.75" long (r0 = 3.0).
const CAL: Calibration = {
  anchorDiameter: 0.25,
  anchorLength: 0.75,
  radialPct: 0.4,
  chipLoadPct: 0.0175,
};
const KNOBS: ModelKnobs = {
  exponent: 3,
  radialCapPct: 0.45,
  radialFloorPct: 0.05,
  chipLoadCapPct: 0.0225,
  chipLoadFloorPct: 0.002,
};

function family(over: Partial<ToolFamily> = {}): ToolFamily {
  return {
    id: "test",
    name: "golden",
    geometry: "square",
    fluteCount: 3,
    rpm: 15000,
    diameters: [0.25],
    calibration: CAL,
    knobs: KNOBS,
    ldGrid: { min: 1.5, max: 8.0, step: 0.5 },
    overrides: [],
    ...over,
  };
}

// feed/MRR golden values are for D = 0.25 (perDiameter[0]).
const row = (fam: ToolFamily, r: number) => computeRow(fam, r);
const at025 = (fam: ToolFamily, r: number) => row(fam, r).perDiameter[0];

describe("golden cases (spec §9 acceptance table)", () => {
  // L/D | radial %D | chip load %D | status | feed (D=0.25) | MRR (D=0.25)
  const cases: [number, number, number, string, number, number][] = [
    [1.5, 0.45, 0.0225, "both at ceiling", 253.1, 10.7],
    [2.5, 0.45, 0.0225, "both at ceiling", 253.1, 17.8],
    [3.0, 0.4, 0.0175, "anchor", 196.9, 14.8],
    [4.0, 0.169, 0.0175, "radial sliding", 196.9, 8.3],
    [6.0, 0.05, 0.0175, "radial at floor", 196.9, 3.7],
    [8.0, 0.05, 0.0074, "radial at floor", 83.1, 2.1],
  ];

  for (const [ld, ae, fz, status, feed, mrr] of cases) {
    it(`L/D ${ld.toFixed(1)}`, () => {
      const fam = family();
      const r = row(fam, ld);
      expect(r.radialPct).toBeCloseTo(ae, 3); // tolerance 0.001 on fractions
      expect(r.chipLoadPct).toBeCloseTo(fz, 3);
      expect(r.status).toBe(status);
      const d = r.perDiameter[0];
      expect(d.feedIpm).toBeCloseTo(feed, 1); // tolerance 0.1 on feed
      expect(d.mrr).toBeCloseTo(mrr, 1); // tolerance 0.1 on MRR
    });
  }
});

describe("property tests (spec §9)", () => {
  it("1. anchor identity: at r0 returns ae0, fz0 for any diameter", () => {
    const r0 = referenceLD(CAL);
    for (const D of [0.125, 0.25, 0.5, 1.0]) {
      const r = row(family({ diameters: [D] }), r0);
      expect(r.radialPct).toBeCloseTo(CAL.radialPct, 9);
      expect(r.chipLoadPct).toBeCloseTo(CAL.chipLoadPct, 9);
    }
  });

  it("2. ratio invariance: same r across diameters => identical ratios", () => {
    const fam = family({ diameters: [0.25, 0.375, 1.0] });
    for (const ld of [1.5, 3.0, 4.0, 8.0]) {
      const r = row(fam, ld);
      const a = allocate(CAL, KNOBS, ld);
      for (const pd of r.perDiameter) {
        // ratios are row-level; per-diameter blocks share them
        expect(r.radialPct).toBeCloseTo(a.ae, 12);
        expect(r.chipLoadPct).toBeCloseTo(a.fz, 12);
        expect(pd.wocIn).toBeCloseTo(a.ae * pd.diameter, 12);
        expect(pd.chipLoadIn).toBeCloseTo(a.fz * pd.diameter, 12);
      }
    }
  });

  it("3. feed scaling: feed(D2)/feed(D1) == D2/D1 at same r", () => {
    const fam = family({ diameters: [0.25, 0.375] });
    for (const ld of [1.5, 3.0, 4.0, 8.0]) {
      const [d1, d2] = row(fam, ld).perDiameter;
      expect(d2.feedIpm / d1.feedIpm).toBeCloseTo(0.375 / 0.25, 9); // 1.500
    }
  });

  it("4. MRR scaling: MRR(D2)/MRR(D1) == (D2/D1)^3 at same r", () => {
    const fam = family({ diameters: [0.25, 0.375] });
    for (const ld of [1.5, 3.0, 4.0, 8.0]) {
      const [d1, d2] = row(fam, ld).perDiameter;
      expect(d2.mrr / d1.mrr).toBeCloseTo(Math.pow(0.375 / 0.25, 3), 9); // 3.375
    }
  });

  it("5. flat chip load fallback: fz_cap == fz0 holds chip load constant from r0 down", () => {
    const fam = family({ knobs: { ...KNOBS, chipLoadCapPct: CAL.chipLoadPct } });
    for (const ld of [1.5, 2.0, 2.5, 3.0]) {
      expect(row(fam, ld).chipLoadPct).toBeCloseTo(CAL.chipLoadPct, 9);
    }
  });

  it("6. monotonicity: past r0 radial and chip load are non-increasing", () => {
    const fam = family();
    const rows = computeFamily(fam).filter((r) => r.ld >= referenceLD(CAL));
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].radialPct).toBeLessThanOrEqual(rows[i - 1].radialPct + 1e-12);
      expect(rows[i].chipLoadPct).toBeLessThanOrEqual(rows[i - 1].chipLoadPct + 1e-12);
    }
  });

  it("7. floors respected across the whole grid", () => {
    const fam = family({ ldGrid: { min: 1.0, max: 12.0, step: 0.25 } });
    for (const r of computeFamily(fam)) {
      expect(r.radialPct).toBeGreaterThanOrEqual(KNOBS.radialFloorPct - 1e-12);
      expect(r.chipLoadPct).toBeGreaterThanOrEqual(KNOBS.chipLoadFloorPct - 1e-12);
    }
  });

  it("8. anchor diameter independence: same L/D ratio + ae0/fz0, different D_a => identical ratios", () => {
    const calA = family({ calibration: CAL });
    const calB = family({
      calibration: { anchorDiameter: 0.5, anchorLength: 1.5, radialPct: 0.4, chipLoadPct: 0.0175 },
    });
    const rowsA = computeFamily(calA);
    const rowsB = computeFamily(calB);
    expect(rowsA.length).toBe(rowsB.length);
    for (let i = 0; i < rowsA.length; i++) {
      expect(rowsA[i].radialPct).toBeCloseTo(rowsB[i].radialPct, 12);
      expect(rowsA[i].chipLoadPct).toBeCloseTo(rowsB[i].chipLoadPct, 12);
    }
  });
});

// --- three-stage cascade (Tim, 2026-07-01) ---
describe("derate3 — three-stage cascade on stickout L/D", () => {
  const A: Derate3Anchor = { radialPct: 0.3, chipLoadPct: 0.012 };
  const K: Derate3Bounds = {
    radialCapPct: 0.45,
    radialFloorPct: 0.1,
    chipLoadCapPct: 0.016,
    chipLoadFloorPct: 0.004,
    axialFloorFrac: 0.25,
  };
  const r0 = 2.5;

  it("passes through the anchor exactly at r0", () => {
    const d = derate3(A, K, 4, r0, r0);
    expect(d.stage).toBe("anchor");
    expect(d.ae).toBeCloseTo(0.3, 12);
    expect(d.fz).toBeCloseTo(0.012, 12);
    expect(d.axialFrac).toBe(1);
  });

  it("below r0 the tool is rigid: values ramp up toward caps, axial stays full", () => {
    const d = derate3(A, K, 4, r0, 1.5);
    expect(d.stage).toBe("rigid");
    expect(d.ae).toBeGreaterThanOrEqual(0.3);
    expect(d.fz).toBeGreaterThanOrEqual(0.012);
    expect(d.ae).toBeLessThanOrEqual(K.radialCapPct + 1e-12);
    expect(d.fz).toBeLessThanOrEqual(K.chipLoadCapPct + 1e-12);
    expect(d.axialFrac).toBe(1);
  });

  it("cascades radial → chip → axial in order as the tool gets longer", () => {
    const stages = [3, 4, 6, 9, 14].map((r) => derate3(A, K, 4, r0, r).stage);
    // monotonic progression through the cascade (no going backwards)
    const rank = { anchor: 0, rigid: 0, radial: 1, chip: 2, axial: 3 } as const;
    for (let i = 1; i < stages.length; i++) {
      expect(rank[stages[i]]).toBeGreaterThanOrEqual(rank[stages[i - 1]]);
    }
    expect(stages[0]).toBe("radial");
    expect(stages.at(-1)).toBe("axial");
  });

  it("never breaches any floor", () => {
    for (let r = r0; r <= 20; r += 0.1) {
      const d = derate3(A, K, 4, r0, r);
      expect(d.ae).toBeGreaterThanOrEqual(K.radialFloorPct - 1e-12);
      expect(d.fz).toBeGreaterThanOrEqual(K.chipLoadFloorPct - 1e-12);
      expect(d.axialFrac).toBeGreaterThanOrEqual(K.axialFloorFrac - 1e-12);
      expect(d.axialFrac).toBeLessThanOrEqual(1);
    }
  });

  it("axial only gives after radial AND chip are both floored", () => {
    for (let r = r0; r <= 20; r += 0.1) {
      const d = derate3(A, K, 4, r0, r);
      if (d.axialFrac < 1 - 1e-9) {
        expect(d.ae).toBeCloseTo(K.radialFloorPct, 9);
        expect(d.fz).toBeCloseTo(K.chipLoadFloorPct, 9);
      }
    }
  });
});
