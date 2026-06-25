// standardCalibration.ts — the standard HEM/adaptive calibration shared across families.
//
// Tim, 2026-06-22: "use Helical H45AL-3 as the standard." One definition, imported by
// every family seed. Anchored to H45AL-3: the vendor's IPT is quoted at 2.5×D LOC, so
// r0 = 2.5 (D_a=0.25, L_a=0.625); fz0 = the vendor rough IPT factor 0.012. The radial
// anchor ae0 and the caps/floors are HEM-aluminum engineering defaults — meant to be
// re-anchored to a bench-trusted tool (that re-anchoring is the configurator's whole UX).
import type { Calibration, ModelKnobs } from "./leverModel";

export const STANDARD_HEM_ANCHOR: Calibration = {
  anchorDiameter: 0.25,
  anchorLength: 0.625, // r0 = 2.5
  radialPct: 0.15,
  chipLoadPct: 0.012,
};

export const STANDARD_HEM_KNOBS: ModelKnobs = {
  exponent: 3, // balanced / general roughing
  radialCapPct: 0.25,
  radialFloorPct: 0.05,
  chipLoadCapPct: 0.014,
  chipLoadFloorPct: 0.003,
};
