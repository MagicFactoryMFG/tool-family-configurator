// materials.ts — the material families and their preset prefix + surface speed.
// Aluminum is calibrated from Helical's S&F; the steels carry standard carbide-in-steel
// starting-point surface speeds and are flagged uncalibrated until per-role calibration
// (a later step) lands — every steel preset is noted as a starting point.
export interface Material {
  key: string;
  label: string;
  prefix: string; // preset name prefix, e.g. AluWrought_Adaptive_Rough
  sfm: number;
  calibrated: boolean;
}

export const MATERIALS: Material[] = [
  { key: "alu", label: "Aluminum", prefix: "AluWrought", sfm: 2100, calibrated: true },
  { key: "lowc", label: "Low Carbon Steel", prefix: "LowCSteel", sfm: 400, calibrated: false },
  { key: "ss", label: "Stainless Steel", prefix: "StainlessSteel", sfm: 250, calibrated: false },
];

export const materialByKey = (k: string): Material => MATERIALS.find((m) => m.key === k) ?? MATERIALS[0];
