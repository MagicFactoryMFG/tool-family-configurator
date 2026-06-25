// holders.ts — ER collet-chuck holder selection by cutter diameter.
// Mirrors the Manual Builder pick_holder(): the holder JSON is embedded and chosen by Ø.
import holdersJson from "../data/ctER_holders.json";

export type Holder = Record<string, unknown> & { description: string; segments: unknown[] };

const byEr = new Map<number, Holder>();
for (const h of (holdersJson as { data: Holder[] }).data) {
  const m = /ER(\d+)/i.exec(h.description);
  if (m) byEr.set(+m[1], h);
}

/** Editable size→holder thresholds (inches). Defaults match Tim's mapping. */
export interface HolderThresholds {
  er16Max: number; // ≤ this → ER16   (1/8"–3/16")
  er25MaxExcl: number; // < this → ER25 (>3/16" and <3/8")
  er32Max: number; // ≤ this → ER32   (3/8"–5/8"); above → ER40
}
export const DEFAULT_THRESHOLDS: HolderThresholds = { er16Max: 0.1875, er25MaxExcl: 0.375, er32Max: 0.625 };

export function pickEr(dia: number, t: HolderThresholds = DEFAULT_THRESHOLDS): number {
  return dia <= t.er16Max ? 16 : dia < t.er25MaxExcl ? 25 : dia <= t.er32Max ? 32 : 40;
}

// Fusion's embedded-holder schema is exactly these keys; extra keys (expressions with
// segment_N_height refs, reference_guid, last_modified) break library import.
const HOLDER_KEYS = ["description", "gaugeLength", "guid", "product-id", "product-link", "segments", "type", "unit", "vendor"];
const clean = (h: Holder): Holder => {
  const o: any = {};
  for (const k of HOLDER_KEYS) if (k in h) o[k] = (h as any)[k];
  return o;
};

export function pickHolder(dia: number, t: HolderThresholds = DEFAULT_THRESHOLDS): Holder {
  const h = byEr.get(pickEr(dia, t));
  if (!h) throw new Error(`no ER holder for Ø${dia}`);
  return clean(h);
}

export const availableEr = () => [...byEr.keys()].sort((a, b) => a - b);
