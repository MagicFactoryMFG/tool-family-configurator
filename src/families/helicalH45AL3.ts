// helicalH45AL3.ts — the STANDARD default family for the configurator.
//
// Helical H45AL-3 "3 Flute, Square - 45° Helix", end mills for aluminum & non-ferrous.
// Diameters are the family's listed cutter diameters; the calibration + knobs are the
// shared standard. This is what the app loads out of the box (Tim, 2026-06-22).
import type { ToolFamily } from "../leverModel";
import { STANDARD_HEM_ANCHOR, STANDARD_HEM_KNOBS } from "../standardCalibration";

export const helicalH45AL3: ToolFamily = {
  id: "helical-h45al3",
  name: "Helical H45AL-3 — 3 Flute Square 45° Helix",
  vendor: "Helical Solutions",
  geometry: "square",
  fluteCount: 3,
  coating: "Uncoated / Zplus",
  material: "Wrought Aluminum",
  notes:
    "Standard reference family. HEM adaptive calibration anchored to the vendor S&F " +
    "(IPT quoted at 2.5×D LOC → r0 = 2.5). Re-anchor to a bench-trusted tool to tune.",
  rpm: 15000,
  diameters: [0.125, 0.1875, 0.25, 0.3125, 0.375, 0.5, 0.625, 0.75, 1.0],
  calibration: STANDARD_HEM_ANCHOR,
  knobs: STANDARD_HEM_KNOBS,
  ldGrid: { min: 1.5, max: 8.0, step: 0.5 },
  overrides: [],
};

export default helicalH45AL3;
