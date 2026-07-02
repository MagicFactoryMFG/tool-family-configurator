// anchors.ts — per-role ANCHOR calibrations for the standard aluminum datasheet.
//
// These are the cutting values AT THE ANCHOR TOOL (Tim's Google Sheet "TFC Role
// Calibrations (Aluminum)", 2026-07-01). The three-stage lever (see leverModel.derate3)
// interpolates each role from here across the family by stickout L/D. Ported from
// Toolpath's make_magic_presets per-preset formulas with a single standard datasheet.
//
// Anchor r0 is the stickout ratio (reach/D) of the reference tool — NOT flute/D. Chip and
// radial are fractions of diameter; axial is (flute-length or diameter) × factor.

export type AxialBase = "flute" | "dia";

export interface RoleAnchor {
  key: string;
  radialPct: number;      // ae0 at the anchor (fraction of D)
  chipLoadPct: number;    // fz0 at the anchor (fraction of D); ignored when chipFixedIn set
  chipFixedIn?: number;   // fixed chip load in inches/tooth (Face_Rough) — overrides chipLoadPct
  axial: { base: AxialBase; factor: number };
  exponent: number;       // m — lever derating steepness (higher = steeper on long tools)
}

// Fractions: sheet "1.2" %D → 0.012, "30" %D → 0.30, etc.
export const ALU_ANCHORS: RoleAnchor[] = [
  { key: "Face_Rough",        radialPct: 0.85, chipLoadPct: 0.012, chipFixedIn: 0.004, axial: { base: "flute", factor: 0.4 },  exponent: 3 },
  { key: "Adaptive_Rough",    radialPct: 0.30, chipLoadPct: 0.012,                     axial: { base: "flute", factor: 1.0 },  exponent: 4 },
  { key: "Traditional_Rough", radialPct: 0.75, chipLoadPct: 0.006,                     axial: { base: "dia",   factor: 0.5 },  exponent: 4 },
  { key: "Bore_Rough",        radialPct: 1.00, chipLoadPct: 0.006,                     axial: { base: "dia",   factor: 0.5 },  exponent: 2 },
  { key: "Slot",              radialPct: 1.00, chipLoadPct: 0.006,                     axial: { base: "dia",   factor: 0.35 }, exponent: 4 },
  { key: "Face_Finish",       radialPct: 0.90, chipLoadPct: 0.0075,                    axial: { base: "flute", factor: 1.0 },  exponent: 4 },
  { key: "Floor_Finish",      radialPct: 0.90, chipLoadPct: 0.0075,                    axial: { base: "flute", factor: 1.0 },  exponent: 4 },
  { key: "Wall_Finish",       radialPct: 0.90, chipLoadPct: 0.0075,                    axial: { base: "flute", factor: 1.0 },  exponent: 4 },
  { key: "Bore_Finish",       radialPct: 1.00, chipLoadPct: 0.0075,                    axial: { base: "dia",   factor: 0.5 },  exponent: 3 },
];

export const ALU_ANCHOR_BY_KEY = new Map(ALU_ANCHORS.map((a) => [a.key, a]));

// Anchor tool reference stickout ratio r0 = reach/D (NOT flute/D). A standard 2.5×D-LOC
// tool carries ~1 diameter of neck/shank exposure, so its stickout ratio is ~3.5. Tools
// longer than this derate; shorter/stubbier ones aggress up. Tunable per family.
export const ANCHOR_R0 = 3.5;

// Caps/floors + axial floor are engineering DEFAULTS (the sheet gives only ae0/fz0/m/axial).
// Derived from the anchor so each role scales sensibly; exposed for tuning later. Flag to Tim.
export interface DerateBounds {
  radialCapPct: number;
  radialFloorPct: number;
  chipLoadCapPct: number;
  chipLoadFloorPct: number;
  axialFloorFrac: number; // lowest fraction of nominal axial the third stage may reach
}

// Floors are set LOW so the rolloff stays gradual on long tools (radial/chip keep sliding
// instead of slamming into a wall), per Tim 2026-07-01. Tunable per role at spot-check.
export function defaultBounds(a: RoleAnchor): DerateBounds {
  const fz0 = a.chipFixedIn ? a.chipFixedIn : a.chipLoadPct;
  return {
    radialCapPct: Math.min(1.0, a.radialPct * 1.5),
    radialFloorPct: Math.max(0.02, a.radialPct * 0.15),
    chipLoadCapPct: fz0 * 1.3,
    chipLoadFloorPct: Math.max(0.0015, fz0 * 0.15),
    axialFloorFrac: 0.2,
  };
}
