// leverModel.ts — the deflection-based force-budget lever model.
//
// PURE and dependency-free (spec §8): no UI imports, no side effects. This module
// is the thing under test (spec §9). The view layer consumes its results and never
// does cutting math itself.
//
// Core idea (spec §2): within a family (same geometry/coating/material) good
// parameters travel as constant ratios of tool diameter at a matched L/D. As a tool
// gets longer relative to its diameter it loses rigidity (cantilever deflection rises
// with the cube of reach), so the force budget — radial engagement × chip load, with
// axial pinned to the full flute — has to come down systematically.

export type GeometryType = "square" | "ballnose" | "bullnose" | "chamfer" | "other";

export interface Calibration {
  anchorDiameter: number; // D_a — the specific known-good tool's diameter
  anchorLength: number;   // L_a — that tool's cutting length
  radialPct: number;      // ae0 — radial %D dialed in on the anchor (fraction)
  chipLoadPct: number;    // fz0 — chip load %D dialed in on the anchor (fraction)
  // r0 (referenceLD) is derived: anchorLength / anchorDiameter
}

export interface ModelKnobs {
  exponent: number;         // m — 2 aggressive, 3 balanced, 4 finish (spec §2.6)
  radialCapPct: number;     // ae_cap
  radialFloorPct: number;   // ae_floor
  chipLoadCapPct: number;   // fz_cap
  chipLoadFloorPct: number; // fz_floor
}

export interface RowOverride {
  ld: number;          // which L/D row this override applies to
  radialPct?: number;  // operator value, fraction
  chipLoadPct?: number;// operator value, fraction
}

export interface ToolFamily {
  id: string;
  name: string;
  vendor?: string;
  geometry: GeometryType;
  fluteCount: number;  // z
  coating?: string;
  material?: string;
  notes?: string;
  rpm: number;
  diameters: number[]; // inches
  calibration: Calibration;
  knobs: ModelKnobs;
  ldGrid: { min: number; max: number; step: number };
  overrides: RowOverride[];
}

export interface Allocation {
  ae: number; // radial %D (fraction)
  fz: number; // chip load %D (fraction)
}

export interface PerDiameter {
  diameter: number;
  fluteLen: number;
  chipLoadIn: number;
  feedIpm: number;
  wocIn: number;
  docIn: number;
  mrr: number;
}

export interface ComputedRow {
  ld: number;
  axialPct: number;    // equals ld — axial is pinned to the full flute (spec §2.1)
  forceBudget: number; // P
  radialPct: number;
  chipLoadPct: number;
  status: string;
  isOverridden: boolean;
  perDiameter: PerDiameter[];
}

const EPS = 1e-9;

/** Reference ratio r0 = L_a / D_a (spec §2.3). */
export function referenceLD(c: Calibration): number {
  return c.anchorLength / c.anchorDiameter;
}

/** Force budget P(r) = ae0 · fz0 · (r0 / r)^m (spec §2.4). */
export function forceBudget(c: Calibration, m: number, r: number): number {
  const r0 = referenceLD(c);
  return c.radialPct * c.chipLoadPct * Math.pow(r0 / r, m);
}

/**
 * Allocate the force budget into radial engagement and chip load (spec §2.5).
 * The allocation order flips at the reference ratio because the binding constraint
 * changes: below r0 the tool is rigid (raise chip load first), above r0 deflection
 * binds (cut radial first). Passes through the anchor exactly at r = r0.
 */
export function allocate(c: Calibration, k: ModelKnobs, r: number): Allocation {
  const r0 = referenceLD(c);
  const P = c.radialPct * c.chipLoadPct * Math.pow(r0 / r, k.exponent);

  let ae: number;
  let fz: number;
  if (r < r0) {
    // rigid: aggress, chip load up first
    fz = Math.min(k.chipLoadCapPct, P / c.radialPct);
    ae = Math.min(k.radialCapPct, P / fz);
  } else {
    // flexible: derate, radial down first
    ae = Math.max(k.radialFloorPct, P / c.chipLoadPct);
    fz = Math.max(k.chipLoadFloorPct, P / ae);
  }
  return { ae, fz };
}

/** Status classification for UI labeling and warnings (spec §2.8). */
export function classify(c: Calibration, k: ModelKnobs, r: number, alloc: Allocation): string {
  const r0 = referenceLD(c);
  if (Math.abs(r - r0) < 1e-6) return "anchor";
  if (r < r0) {
    if (alloc.ae >= k.radialCapPct && alloc.fz >= k.chipLoadCapPct) return "both at ceiling";
    if (alloc.fz >= k.chipLoadCapPct) return "chip load at cap";
    return "ramping up";
  }
  const P = forceBudget(c, k.exponent, r);
  if (P < k.radialFloorPct * k.chipLoadFloorPct) return "axial must give";
  if (alloc.ae <= k.radialFloorPct) return "radial at floor";
  return "radial sliding";
}

/**
 * Compute one row at ratio r across the family's diameters (spec §2.7).
 * A manual override for this L/D replaces the computed radial and/or chip load and
 * recomputes the downstream feed and MRR (spec §3.5).
 */
export function computeRow(fam: ToolFamily, r: number): ComputedRow {
  const base = allocate(fam.calibration, fam.knobs, r);
  const ov = fam.overrides.find((o) => Math.abs(o.ld - r) < 1e-6);
  const ae = ov?.radialPct ?? base.ae;
  const fz = ov?.chipLoadPct ?? base.fz;
  const isOverridden = !!ov && (ov.radialPct !== undefined || ov.chipLoadPct !== undefined);

  const status = classify(fam.calibration, fam.knobs, r, { ae, fz });
  const P = forceBudget(fam.calibration, fam.knobs.exponent, r);

  const perDiameter: PerDiameter[] = fam.diameters.map((D) => {
    const fluteLen = r * D;
    const chipLoadIn = fz * D;
    const feedIpm = fam.rpm * fam.fluteCount * chipLoadIn;
    const wocIn = ae * D;
    const docIn = r * D; // equals flute length — axial pinned to full flute
    const mrr = wocIn * docIn * feedIpm;
    return { diameter: D, fluteLen, chipLoadIn, feedIpm, wocIn, docIn, mrr };
  });

  return {
    ld: r,
    axialPct: r,
    forceBudget: P,
    radialPct: ae,
    chipLoadPct: fz,
    status,
    isOverridden,
    perDiameter,
  };
}

// --- Three-stage derating (Tim, 2026-07-01) -------------------------------------------
// Generalises the two-axis `allocate` to a THREE-stage cascade, applied per-role and keyed
// on STICKOUT L/D (reach/D), not flute/D. As a tool gets longer the force budget falls and
// is shed in order: (1) radial + chip together (as `allocate`), then (2) once BOTH hit their
// floors, (3) axial gives — the stepdown drops below its nominal value. Axial has its own
// floor so a very long tool still takes a real depth.

export interface Derate3Anchor {
  radialPct: number;   // ae0 at r0 (fraction)
  chipLoadPct: number; // fz0 at r0 (fraction)
}
export interface Derate3Bounds {
  radialCapPct: number;
  radialFloorPct: number;
  chipLoadCapPct: number;
  chipLoadFloorPct: number;
  axialFloorFrac: number; // lowest fraction of nominal axial the third stage may reach
}
export type DerateStage = "anchor" | "rigid" | "radial" | "chip" | "axial";
export interface Derate3 {
  ae: number;        // radial %D (fraction)
  fz: number;        // chip load %D (fraction)
  axialFrac: number; // multiplier on the role's nominal axial (1 = full)
  stage: DerateStage;
}

/**
 * Three-stage force-budget derating at stickout ratio r (= reach/D), anchored at r0.
 * P(r) = ae0·fz0·(r0/r)^m. Below r0 the tool is rigid (chip up, then radial up, to caps);
 * above r0 radial slides to its floor, then chip to its floor, then the remaining deficit
 * spills into axial (down to axialFloorFrac).
 */
export function derate3(a: Derate3Anchor, k: Derate3Bounds, m: number, r0: number, r: number): Derate3 {
  const P = a.radialPct * a.chipLoadPct * Math.pow(r0 / r, m);
  if (Math.abs(r - r0) < 1e-6) {
    return { ae: a.radialPct, fz: a.chipLoadPct, axialFrac: 1, stage: "anchor" };
  }
  if (r < r0) {
    const fz = Math.min(k.chipLoadCapPct, P / a.radialPct);
    const ae = Math.min(k.radialCapPct, P / fz);
    return { ae, fz, axialFrac: 1, stage: "rigid" };
  }
  const ae = Math.max(k.radialFloorPct, P / a.chipLoadPct);
  const fz = Math.max(k.chipLoadFloorPct, P / ae);
  let axialFrac = 1;
  const floorProduct = k.radialFloorPct * k.chipLoadFloorPct;
  if (P < floorProduct) axialFrac = Math.max(k.axialFloorFrac, P / floorProduct);
  // Label by which axis is currently giving: radial slides first; once it floors, chip slides;
  // once both floor, axial gives.
  const stage: DerateStage = axialFrac < 1 - 1e-9 ? "axial" : ae <= k.radialFloorPct + 1e-9 ? "chip" : "radial";
  return { ae, fz, axialFrac, stage };
}

/** Compute the whole family across its L/D grid (spec §3.2). */
export function computeFamily(fam: ToolFamily): ComputedRow[] {
  const { min, max, step } = fam.ldGrid;
  if (!(min > 0) || !(max > min) || !(step > 0)) {
    throw new Error("invalid L/D grid: require 0 < min < max and step > 0");
  }
  const n = Math.floor((max - min) / step + EPS) + 1;
  const rows: ComputedRow[] = [];
  for (let i = 0; i < n; i++) {
    const r = +(min + i * step).toFixed(10);
    rows.push(computeRow(fam, r));
  }
  return rows;
}
