// ingest.ts — turn a dropped geometry source into ToolBlank[] (geometry only; cutting
// params come from the family calibration). Supports Fusion .tools/.json (structured) and
// CSV (vendor product tables, mapped by header keywords with fraction parsing).
import type { ToolBlank } from "./library";

/** Parse a fractional-inch cell: "1-1/2"→1.5, "3/16"→0.1875, "0.25"→0.25. */
export function frac(s: string): number {
  const t = (s ?? "").trim();
  if (!t) return NaN;
  let m = t.match(/^(\d+)\s*-\s*(\d+)\/(\d+)$/);
  if (m) return +m[1] + +m[2] / +m[3];
  m = t.match(/^(\d+)\/(\d+)$/);
  if (m) return +m[1] / +m[2];
  const n = Number(t);
  return isNaN(n) ? NaN : n;
}

const positive = (v: any): v is number => typeof v === "number" && isFinite(v) && v > 0;

/** Geometry blanks from a Fusion .tools / .json library. Skips holders AND any tool that
 * lacks valid cutting geometry (DC/LCF/OAL) — e.g. probes, taps, or drills in a mixed
 * machine library. Converting those to end mills yields null geometry and breaks Fusion
 * import. Returns only millable blanks; callers compare against the raw count to report skips. */
export function parseToolsJson(json: any): ToolBlank[] {
  const data: any[] = json?.data ?? [];
  return data
    .filter((t) => t && t.geometry && t.type !== "holder")
    .filter((t) => positive(t.geometry.DC) && positive(t.geometry.LCF) && positive(t.geometry.OAL))
    .map((t) => {
      const g = t.geometry;
      const sd = g["shoulder-diameter"];
      return {
        diameter: g.DC,
        shank: positive(g.SFDM) ? g.SFDM : g.DC,
        fluteLength: g.LCF,
        overallLength: g.OAL,
        flutes: positive(g.NOF) ? g.NOF : 3,
        partNo: String(t["product-id"] ?? ""),
        coating: t.GRADE ?? t.grade,
        description: t.description,
        reachIn: positive(g.LB) ? g.LB : undefined,
        neckDiameterIn: positive(sd) && sd < g.DC - 1e-9 ? sd : undefined, // real reduced neck
      };
    });
}

/** Count of data tools that are NOT millable (for "skipped N" reporting). */
export function nonMillableCount(json: any): number {
  const data: any[] = json?.data ?? [];
  const tools = data.filter((t) => t && t.type !== "holder");
  const millable = tools.filter((t) => t.geometry && positive(t.geometry.DC) && positive(t.geometry.LCF) && positive(t.geometry.OAL));
  return tools.length - millable.length;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === ",") { out.push(cur); cur = ""; }
    else if (c === '"') q = true;
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** Geometry blanks from a CSV product table. Columns are matched by header keywords, so
 * minor layout differences are tolerated; rows that don't parse as tools are skipped. */
export function parseCsv(text: string): ToolBlank[] {
  const rows = text.split(/\r?\n/).filter((l) => l.trim().length).map(splitCsvLine);
  if (!rows.length) return [];
  let hi = rows.findIndex((r) => r.some((c) => /cutter\s*diameter|^\s*diameter/i.test(c)));
  if (hi < 0) hi = 0;
  // Vendor tables often use a 2-row header (e.g. "Zplus Coated" / "Tool #"). Merge the
  // header row with the next so column detection sees both labels per column.
  const h1 = rows[hi + 1] ?? [];
  const header = rows[hi].map((c, i) => `${c} ${h1[i] ?? ""}`.toLowerCase());
  const col = (...keys: RegExp[]) => header.findIndex((c) => keys.some((k) => k.test(c)));
  const ci = {
    dia: col(/cutter\s*diameter/, /^\s*diameter/, /\bd1\b/),
    shank: col(/shank\s*diameter/, /\bd2\b/),
    loc: col(/length of cut/, /\bloc\b/, /\bl2\b/),
    oal: col(/overall length/, /\boal\b/, /\bl1\b/),
    flutes: col(/flutes/, /^#$/),
    desc: col(/tool description/, /description/),
    reach: col(/lbs/, /reach/, /\bl3\b/), // reduced-neck reach
    neck: col(/neck/),
  };
  // Tool-number columns: one per coating (Uncoated / Zplus) if present, else a generic "Tool #".
  const coatCols: { label: string | undefined; idx: number }[] = [];
  header.forEach((h, i) => {
    if (/uncoated/.test(h)) coatCols.push({ label: "Uncoated", idx: i });
    else if (/zplus/.test(h)) coatCols.push({ label: "Zplus", idx: i });
  });
  if (!coatCols.length) {
    const t = col(/tool\s*#/);
    if (t >= 0) coatCols.push({ label: undefined, idx: t });
  }

  const blanks: ToolBlank[] = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    const dia = frac(r[ci.dia] ?? "");
    const fl = Number((r[ci.flutes] ?? "").trim());
    const loc = frac(r[ci.loc] ?? "");
    const oal = frac(r[ci.oal] ?? "");
    if (isNaN(dia) || isNaN(loc) || isNaN(oal) || !(fl >= 1 && fl <= 20)) continue; // not a data row
    const shank = ci.shank >= 0 ? frac(r[ci.shank] ?? "") : dia;
    const code = ci.desc >= 0 ? (r[ci.desc] ?? "").trim() : "";
    const reach = ci.reach >= 0 ? frac(r[ci.reach] ?? "") : NaN;
    const neck = ci.neck >= 0 ? frac(r[ci.neck] ?? "") : NaN;
    for (const cc of coatCols) {
      const pid = (r[cc.idx] ?? "").trim();
      if (!pid) continue; // this coating not offered in this size
      blanks.push({
        diameter: dia, shank: isNaN(shank) ? dia : shank, fluteLength: loc, overallLength: oal,
        flutes: fl, partNo: pid || code, coating: cc.label, code,
        reachIn: reach > 0 ? reach : undefined,
        neckDiameterIn: neck > 0 ? neck : undefined,
      });
    }
  }
  return blanks;
}

/** Dispatch on extension; fall back to sniffing JSON then CSV. */
export function parseGeometry(name: string, content: string): ToolBlank[] {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "tools" || ext === "json") return parseToolsJson(JSON.parse(content));
  if (ext === "csv") return parseCsv(content);
  try { return parseToolsJson(JSON.parse(content)); } catch { return parseCsv(content); }
}
