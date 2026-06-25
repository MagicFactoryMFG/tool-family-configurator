// chatter.ts — first-mode tip natural-frequency ESTIMATE + a coarse chatter flag.
//
// This is a TREND tool, not a stability simulator. The frequency is an upper-bound estimate
// (solid-carbide cylinder idealization — real flutes and holder/spindle compliance LOWER it),
// and real chatter-free speeds need a tap test + stability-lobe analysis. Use this only to:
//   (1) flag long-reach / flexible setups, alongside the lever model's static L/D derating, and
//   (2) suggest candidate spindle speeds (stability-lobe peaks) to tap-test around.
//
// The lever model handles the STATIC failure mode (deflection ∝ L³). This handles the trend of
// the DYNAMIC one (natural frequency ∝ 1/L², which the static model can't see).

// Solid round carbide cantilever, first bending mode: f1 ≈ K · d / L²
// K = 35000 for d,L in inches → Hz. (From β1=1.875, E≈600 GPa, ρ≈14500 kg/m³.)
const K_IMPERIAL = 35000;

/** Estimated first-mode tip natural frequency (Hz). d, L in inches. Upper bound. */
export function tipFrequencyHz(diameterIn: number, stickoutIn: number): number {
  if (!(diameterIn > 0) || !(stickoutIn > 0)) return NaN;
  return (K_IMPERIAL * diameterIn) / (stickoutIn * stickoutIn);
}

/** Tooth-passing (excitation) frequency at a given spindle speed (Hz). */
export function toothPassHz(rpm: number, flutes: number): number {
  return (rpm / 60) * flutes;
}

export type ChatterBand = "stiff" | "moderate" | "long reach" | "extreme reach";

/** Chatter-proneness band, keyed off L/D — the same axis the lever model derates on. */
export function chatterBand(ld: number): ChatterBand {
  if (ld <= 3) return "stiff";
  if (ld <= 4.5) return "moderate";
  if (ld <= 6) return "long reach";
  return "extreme reach";
}

/** Stability-lobe peak speeds: tooth-passing frequency = f1 / k (k = 1,2,3…). RPM, descending. */
export function lobeSpeeds(f1Hz: number, flutes: number, count = 4): number[] {
  if (!(f1Hz > 0) || !(flutes > 0)) return [];
  const out: number[] = [];
  for (let k = 1; k <= count; k++) out.push(Math.round((60 * f1Hz) / (flutes * k)));
  return out;
}

export interface ChatterInfo {
  f1Hz: number;
  ld: number;
  band: ChatterBand;
  /** Lobe-peak speeds that fall within the machine's max RPM (candidates to tap-test around). */
  candidateRpm: number[];
  /** Is the top lobe (tooth-pass = f1) reachable? If false, the tool is stiff for this spindle —
   *  lobe-tuning isn't the lever; just run it. If true, speed choice can matter. */
  topLobeReachable: boolean;
}

export function chatterInfo(diameterIn: number, stickoutIn: number, flutes: number, maxRpm: number): ChatterInfo {
  const f1 = tipFrequencyHz(diameterIn, stickoutIn);
  const ld = stickoutIn / diameterIn;
  const lobes = lobeSpeeds(f1, flutes);
  return {
    f1Hz: Math.round(f1),
    ld: +ld.toFixed(2),
    band: chatterBand(ld),
    candidateRpm: lobes.filter((r) => r <= maxRpm),
    topLobeReachable: lobes.length > 0 && lobes[0] <= maxRpm,
  };
}
