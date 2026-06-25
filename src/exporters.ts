// exporters.ts — JSON and CSV export for the Toolpath engine (spec §6).
// The JSON shape is a placeholder to be aligned with Jan's schema; it preserves the two
// things the spec requires: which rows are manual overrides, and the full calibration + knobs.
import type { ComputedRow, ToolFamily } from "./leverModel";

export function toExportJSON(fam: ToolFamily, rows: ComputedRow[]) {
  return {
    family: {
      name: fam.name,
      vendor: fam.vendor,
      geometry: fam.geometry,
      fluteCount: fam.fluteCount,
      coating: fam.coating,
      material: fam.material,
      rpm: fam.rpm,
    },
    model: {
      exponent: fam.knobs.exponent,
      calibration: fam.calibration,
      knobs: fam.knobs,
    },
    rows: rows.map((r) => ({
      ld: r.ld,
      axialPct: r.axialPct,
      forceBudget: r.forceBudget,
      radialPct: r.radialPct,
      chipLoadPct: r.chipLoadPct,
      status: r.status,
      overridden: r.isOverridden,
      tools: r.perDiameter.map((d) => ({
        diameter: d.diameter,
        fluteLen: d.fluteLen,
        feedIpm: d.feedIpm,
        wocIn: d.wocIn,
        docIn: d.docIn,
        mrr: d.mrr,
      })),
    })),
  };
}

const csvCell = (v: unknown) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(fam: ToolFamily, rows: ComputedRow[]): string {
  const header = [
    "ld",
    "axialPct",
    "radialPct",
    "chipLoadPct",
    "status",
    "overridden",
    "diameter",
    "fluteLen",
    "feedIpm",
    "wocIn",
    "docIn",
    "mrr",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    for (const d of r.perDiameter) {
      lines.push(
        [
          r.ld,
          r.axialPct,
          r.radialPct,
          r.chipLoadPct,
          r.status,
          r.isOverridden,
          d.diameter,
          d.fluteLen,
          d.feedIpm,
          d.wocIn,
          d.docIn,
          d.mrr,
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }
  // family/calibration provenance as trailing comment rows (so a set can be audited)
  lines.push("");
  lines.push(csvCell(`# family: ${fam.name} | vendor: ${fam.vendor ?? ""} | material: ${fam.material ?? ""}`));
  lines.push(
    csvCell(
      `# anchor D_a=${fam.calibration.anchorDiameter} L_a=${fam.calibration.anchorLength} ae0=${fam.calibration.radialPct} fz0=${fam.calibration.chipLoadPct} | m=${fam.knobs.exponent} rpm=${fam.rpm} z=${fam.fluteCount}`,
    ),
  );
  return lines.join("\n");
}

export function download(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
