// verify.ts — a "what to bench-check" summary for a generated library. Cutting parameters
// are model/vendor-S&F fits, not guarantees; this surfaces which presets lean on flagged
// defaults, and a representative few tools to physically verify across the L/D range.

export interface VerifyFlag { label: string; count: number; }
export interface VerifyReport {
  tools: number;
  presets: number;
  flags: VerifyFlag[];
  spotCheck: { description: string; ld: number }[];
}

// Categorize preset-description flags into a small, stable set (adaptive notes carry per-tool
// numbers, so match by keyword rather than exact text).
const CATS: { re: RegExp; label: string }[] = [
  { re: /lever-derated/, label: "Adaptive (HEM): lever-model derated — the anchor is a tunable starting point" },
  { re: /non-vendor default/, label: "HEM/adaptive depths: non-vendor default — verify in Machining Advisor Pro" },
  { re: /Floor-finish stepover/, label: "Floor finish: stepover is an engineering default (vendor 'Fin' RDOC is for walls)" },
  { re: /Starting-point parameters/, label: "Non-aluminum: starting-point parameters — calibrate before use" },
];

export function verifyReport(lib: { data: any[] }): VerifyReport {
  const tools = lib.data ?? [];
  const counts = new Map<string, number>();
  let presets = 0;
  for (const t of tools) {
    for (const p of t["start-values"]?.presets ?? []) {
      presets++;
      const d = String(p.description ?? "").trim();
      if (!d) continue;
      const cat = CATS.find((c) => c.re.test(d));
      const label = cat ? cat.label : d;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  const flags = [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

  // Spot-check: smallest, middle, and largest L/D (flute ÷ Ø) — the stiffness spread.
  const withLd = tools
    .filter((t) => t.geometry?.DC > 0)
    .map((t) => ({ t, ld: t.geometry.LCF / t.geometry.DC }))
    .sort((a, b) => a.ld - b.ld);
  const idxs = withLd.length ? [...new Set([0, Math.floor(withLd.length / 2), withLd.length - 1])] : [];
  const spotCheck = idxs.map((i) => ({ description: withLd[i].t.description, ld: +withLd[i].ld.toFixed(2) }));

  return { tools: tools.length, presets, flags, spotCheck };
}
