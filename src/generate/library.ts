// library.ts — generate a Fusion .tools library from geometry blanks + a family definition.
// Faithful TS port of Manual Builder's export_fusion_h45al3.py: parametric expression
// presets, lever-derated Adaptive_Rough, ER holders by Ø, both coatings as separate tools.
// Cutting parameters are model/calibration-driven — no vendor Speeds & Feeds file needed.
import type { Calibration, GeometryType, ModelKnobs } from "../leverModel";
import { allocate, derate3 } from "../leverModel";
import { STANDARD_HEM_ANCHOR, STANDARD_HEM_KNOBS } from "../standardCalibration";
import { ALU_ANCHOR_BY_KEY, defaultBounds, ANCHOR_R0 } from "./anchors";
import { type RoleSpec, type Base, rolesFor } from "./roles";
import { type HolderThresholds, DEFAULT_THRESHOLDS, pickHolder } from "./holders";

// A physical tool from ingestion — geometry only (cutting params come from the family).
export interface ToolBlank {
  diameter: number; // DC (in)
  shank: number; // SFDM
  fluteLength: number; // LCF
  overallLength: number; // OAL
  flutes: number; // NOF
  partNo: string;
  coating?: string; // grade label (Uncoated / Zplus / …)
  code?: string; // vendor code (e.g. H45AL-S-30125)
  description?: string; // pass-through description if the source had one
  reachIn?: number; // LBS / length below shank (reduced-neck tools); else LB is modeled
  neckDiameterIn?: number; // reduced-neck diameter; else the body is full DC
}

export interface FamilyDef {
  name: string;
  vendor: string;
  link: string;
  material: string;
  geometry: GeometryType;
  prefix: string; // preset material prefix, e.g. AluWrought
  bmc: string;
  rampDeg: number;
  sfm: number; // surface speed (material)
  maxRpm: number; // spindle cap
  calibrated: boolean; // false → params are a flagged starting point (e.g. steels)
  roles: RoleSpec[];
  adaptiveAnchor: Calibration;
  adaptiveKnobs: ModelKnobs;
  holderThresholds: HolderThresholds;
}

// Match Python's round(): banker's rounding (half-to-even) on the number's TRUE decimal
// value, so the TS engine produces byte-identical numbers to the Manual Builder exporter.
// Rounding the high-precision decimal string (not x×10^n) avoids the scaling float error
// that fabricates false ties (e.g. 0.04375 is really 0.043749999… → rounds down).
function pyround(x: number, n: number): number {
  if (!isFinite(x)) return x;
  const neg = x < 0;
  const long = Math.abs(x).toFixed(60); // dyadic doubles have finite decimals; 60 is ample
  const dot = long.indexOf(".");
  const keep = long.slice(0, dot) + long.slice(dot + 1, dot + 1 + n); // value × 10^n, truncated
  const rest = long.slice(dot + 1 + n); // dropped digits
  const first = rest.charCodeAt(0) - 48;
  let up = false;
  if (first > 5) up = true;
  else if (first === 5) up = /[1-9]/.test(rest.slice(1)) || (keep.charCodeAt(keep.length - 1) - 48) % 2 === 1;
  let scaled = BigInt(keep || "0");
  if (up) scaled += 1n;
  const val = Number(scaled) / 10 ** n;
  return neg ? -val : val;
}
const r1 = (x: number) => pyround(x, 1);
const r4 = (x: number) => pyround(x, 4);
const r5 = (x: number) => pyround(x, 5);
const r6 = (x: number) => pyround(x, 6);
const newGuid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.round(performance.now())}`);

function speedFor(sfm: number, dia: number, cap: number | null) {
  const ideal = (sfm * 12) / (Math.PI * dia);
  if (cap && ideal > cap) {
    return { expr: { tool_spindleSpeed: `${cap} rpm` }, n: Math.round(cap), v_c: r1((Math.PI * dia * cap) / 12) };
  }
  return { expr: { tool_surfaceSpeed: `${sfm} fpm` }, n: Math.round(ideal), v_c: sfm };
}

function baseExpr(spec: [Base, number], dia: number, loc: number) {
  const isDia = spec[0] === "dia";
  const varName = isDia ? "tool_diameter" : "tool_fluteLength";
  const ref = isDia ? dia : loc;
  return { expr: `${varName} * ${spec[1]}`, val: r4(ref * spec[1]) };
}

export function presetFor(role: RoleSpec, blank: ToolBlank, fam: FamilyDef, reach: number) {
  const dia = blank.diameter;
  const loc = blank.fluteLength;
  const anchor = ALU_ANCHOR_BY_KEY.get(role.key);
  const notes: string[] = [];

  let fpt: number;                          // chip load as %D for the tool_diameter*fpt expression
  let sdExpr: string, sdVal: number;        // stepdown (axial)
  let soExpr: string | null = null, soVal: number | null = null; // stepover (radial)

  if (anchor) {
    // Anchor-driven: three-stage lever cascade on this tool's stickout L/D (reach/D).
    const r = reach / dia;
    const k = defaultBounds(anchor);
    const d = derate3(
      { radialPct: anchor.radialPct, chipLoadPct: anchor.chipLoadPct },
      k, anchor.exponent, ANCHOR_R0, r,
    );
    // Chip: Face_Rough holds an ABSOLUTE 0.004"/tooth (per-tool %D so the number lands on it);
    // every other role uses the lever-derated %D.
    fpt = anchor.chipFixedIn ? r5(anchor.chipFixedIn / dia) : r5(d.fz);
    // Radial → stepover.
    soVal = r4(d.ae * dia);
    soExpr = `tool_diameter * ${r4(d.ae)}`;
    // Axial → (flute or dia) × factor × axialFrac (third-stage derate), capped at flute below.
    const axVar = anchor.axial.base === "flute" ? "tool_fluteLength" : "tool_diameter";
    const axRef = anchor.axial.base === "flute" ? loc : dia;
    sdVal = r4(axRef * anchor.axial.factor * d.axialFrac);
    sdExpr = `${axVar} * ${r4(anchor.axial.factor * d.axialFrac)}`;
    const chipStr = anchor.chipFixedIn ? `${anchor.chipFixedIn}" fixed` : `${(d.fz * 100).toFixed(2)}%D`;
    notes.push(
      `lever @ stickout L/D ${r.toFixed(2)} ('${d.stage}'): radial ${(d.ae * 100).toFixed(1)}%D, ` +
        `chip ${chipStr}, axial ×${d.axialFrac.toFixed(2)}`,
    );
  } else {
    // Fallback (geometries without an anchor, e.g. ball Surface): static RoleSpec factors,
    // with the legacy adaptive lever on flute/D.
    let spec: RoleSpec = role;
    fpt = role.fpt;
    if (role.key === "Adaptive_Rough") {
      const { ae, fz } = allocate(fam.adaptiveAnchor, fam.adaptiveKnobs, loc / dia);
      fpt = r5(fz);
      spec = { ...role, so: ["dia", r4(ae)] };
    }
    const sd = baseExpr(spec.sd, dia, loc);
    sdExpr = sd.expr; sdVal = sd.val;
    if (spec.so != null) { const so = baseExpr(spec.so, dia, loc); soExpr = so.expr; soVal = so.val; }
  }

  // Fusion requires stepdown (ADOC) ≤ flute length. Cap at the flute, FLOOR-rounded so
  // rounding never pushes the cached value a hair over LCF (e.g. round(0.21875,4)=0.2188 > flute).
  if (sdVal > loc) { sdExpr = "tool_fluteLength * 1"; sdVal = Math.floor(loc * 1e4) / 1e4; }
  if (!fam.calibrated) notes.push(`Starting-point parameters for ${fam.material} - calibrate before use`);

  const useSo = soExpr != null;
  const f_z = r5(fpt * dia);
  const sp = speedFor(fam.sfm, dia, fam.maxRpm);
  const v_f = r4(sp.n * f_z * blank.flutes);
  const v_f_ramp = r4(v_f * 0.75);

  // Expression block in the EXACT format of the working Super Duper Configurator exports
  // (HomeVF2SS_configured / MATSUURA_configured): parametric FORMULAS, with the numeric
  // fields as their calculated results. Only these keys are valid. Note "5 deg".
  const expressions: Record<string, string> = {
    tool_feedEntry: "tool_feedCutting",
    tool_feedExit: "tool_feedCutting",
    tool_feedPerTooth: `tool_diameter * ${fpt}`,
    tool_feedRamp: "tool_feedCutting * 0.75",
    tool_feedTransition: "tool_feedCutting",
    tool_rampAngle: `${fam.rampDeg} deg`,
    tool_rampSpindleSpeed: "tool_spindleSpeed",
    tool_stepdown: sdExpr,
  };
  if (useSo) expressions.tool_stepover = soExpr!;

  const p: Record<string, unknown> = {
    guid: newGuid(),
    name: `${fam.prefix}_${role.key}`,
    description: notes.join("; "),
    "tool-coolant": "flood",
    f_n: r6(f_z * blank.flutes),
    f_z,
    n: sp.n,
    n_ramp: sp.n,
    "ramp-angle": fam.rampDeg,
    v_c: sp.v_c,
    v_f,
    v_f_leadIn: v_f,
    v_f_leadOut: v_f,
    v_f_ramp,
    v_f_transition: v_f,
    v_f_plunge: 100.0,
    "use-stepdown": true,
    "use-stepover": useSo,
    stepdown: sdVal,
    expressions,
    material: { category: "all", query: "", "use-hardness": false },
  };
  if (useSo) p.stepover = soVal;
  return p;
}

const FRACS: Array<[number, string]> = [];
for (const d of [2, 4, 8, 16]) for (let n = 1; n < d; n++) FRACS.push([n / d, `${n}/${d}`]);
/** Decimal inches → mixed-fraction label (e.g. 1.25 → "1-1/4"), nearest 1/16. */
function frac(x: number): string {
  const whole = Math.floor(x + 1e-9);
  const rem = x - whole;
  let label = "";
  if (rem > 1e-6) {
    let best = FRACS[0];
    for (const f of FRACS) if (Math.abs(f[0] - rem) < Math.abs(best[0] - rem)) best = f;
    if (Math.abs(best[0] - rem) < 1 / 32) label = best[1];
  }
  if (whole && label) return `${whole}-${label}`;
  if (whole) return `${whole}`;
  return label || x.toFixed(3);
}

function describe(blank: ToolBlank, fam: FamilyDef): string {
  if (blank.description) return blank.description;
  const geoWord = fam.geometry === "ballnose" ? "Ball" : "Square";
  const v = fam.vendor.split(" ")[0];
  return `${frac(blank.diameter)}" ${blank.flutes}FL ${geoWord} EM ${frac(blank.fluteLength)} LOC ${blank.coating ?? ""} - ${v} ${blank.code ?? blank.partNo}`
    .replace(/\s+/g, " ")
    .trim();
}

const LAST_MODIFIED = 1782000000000;

export function buildTool(blank: ToolBlank, fam: FamilyDef, idx: number) {
  const dec = blank.diameter;
  const loc = blank.fluteLength;
  const isBall = fam.geometry === "ballnose";
  const necked = typeof blank.reachIn === "number" && blank.reachIn > 0;
  // Reduced-neck tools carry a real reach (LBS) + neck Ø; otherwise model LB = LCF + DC.
  const lb = necked ? r4(blank.reachIn!) : r4(Math.min(loc + dec, blank.overallLength));
  const shoulderDia = typeof blank.neckDiameterIn === "number" && blank.neckDiameterIn > 0 ? blank.neckDiameterIn : dec;
  const shoulderLen = necked ? r4(blank.reachIn!) : loc;
  const holder = pickHolder(dec, fam.holderThresholds);
  const geometry = {
    CSP: false, HAND: true, NT: 0, SIG: 0, TP: 0,
    DC: dec, RE: isBall ? dec / 2 : 0.0, "tip-diameter": isBall ? 0.0 : dec,
    LB: lb, LCF: loc, OAL: blank.overallLength, SFDM: blank.shank, NOF: blank.flutes, TA: 0,
    "shoulder-diameter": shoulderDia, "shoulder-length": shoulderLen,
    "thread-profile-angle": 0, "tip-length": 0, "tip-offset": 0,
    // spindle-gauge → tip; Fusion needs this whenever a holder is present
    "assemblyGaugeLength": r6((holder.gaugeLength as number ?? 0) + lb),
  };
  return {
    guid: newGuid(),
    type: isBall ? "ball end mill" : "flat end mill",
    unit: "inches",
    vendor: fam.vendor,
    BMC: fam.bmc,
    GRADE: blank.coating, // Fusion coating-grade field
    grade: blank.coating, // kept for the viewer's coating switch
    last_modified: LAST_MODIFIED,
    "product-id": String(blank.partNo),
    "product-link": fam.link,
    description: describe(blank, fam),
    "post-process": { number: idx, "diameter-offset": idx, "length-offset": idx, live: true, turret: 0,
      "break-control": false, comment: "", "manual-tool-change": false },
    geometry,
    holder,
    "start-values": { presets: fam.roles.map((role) => presetFor(role, blank, fam, lb)) },
  };
}

export function buildLibrary(blanks: ToolBlank[], fam: FamilyDef) {
  return { version: 36, data: blanks.map((b, i) => buildTool(b, fam, i + 1)) };
}

/** The standard square aluminum family (H45AL-3) preset. maxRpm + roles are user inputs. */
export function defaultSquareFamily(opts: Partial<FamilyDef> = {}): FamilyDef {
  return {
    name: "Helical H45AL-3 — 3 Flute Square 45° Helix",
    vendor: "Helical Solutions",
    link: "https://www.helicaltool.com/products/3-flute-square-45-helix",
    material: "Wrought Aluminum",
    geometry: "square",
    prefix: "AluWrought",
    bmc: "carbide",
    rampDeg: 5,
    sfm: 2100,
    maxRpm: 15000,
    calibrated: true,
    roles: rolesFor("square"),
    adaptiveAnchor: STANDARD_HEM_ANCHOR,
    adaptiveKnobs: STANDARD_HEM_KNOBS,
    holderThresholds: DEFAULT_THRESHOLDS,
    ...opts,
  };
}

/** The standard ball aluminum family (H35AL-3). */
export function defaultBallFamily(opts: Partial<FamilyDef> = {}): FamilyDef {
  return defaultSquareFamily({
    name: "Helical H35AL-3 — 3 Flute Ball 35° Helix",
    link: "https://www.helicaltool.com/products/3-flute-ball-35-helix",
    geometry: "ballnose",
    roles: rolesFor("ballnose"),
    ...opts,
  });
}
