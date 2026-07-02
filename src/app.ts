// app.ts — Lever Model page. Per-PRESET three-stage lever grid over stickout L/D (reach/D).
// Pick a preset, tune its anchor, watch the values re-interpolate across the family grid, and
// export the library. Shares the tuned anchors + loaded family with the Build page (buildStore),
// so edits here flow there and back. All cutting math lives in leverModel/anchors (spec §8).
import { derate3 } from "./leverModel";
import { ALU_ANCHORS, defaultBounds, ANCHOR_R0, type RoleAnchor } from "./generate/anchors";
import { buildLibrary, defaultSquareFamily, defaultBallFamily, type FamilyDef, type ToolBlank } from "./generate/library";
import { roleSpec, ROLE_CATALOG, applicableRoleKeys, geoKey, type RoleSpec } from "./generate/roles";
import { materialByKey } from "./generate/materials";
import { parseToolsJson } from "./generate/ingest";
import { buildStore } from "./storage";
import { lineChart, type Series } from "./charts";
import { download } from "./exporters";
import { pct1, pct2, num1, len3 } from "./format";
import sampleRaw from "./generate/__fixtures__/Helical_H45AL-3.tools?raw";

type FamKey = "square" | "ball";
const cloneAnchors = (): Record<string, RoleAnchor> =>
  Object.fromEntries(ALU_ANCHORS.map((a) => [a.key, { ...a, axial: { ...a.axial } }]));
const sortDeep = (x: any): any =>
  Array.isArray(x) ? x.map(sortDeep) : x && typeof x === "object"
    ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sortDeep(x[k])])) : x;

// ---- state (shared with Build via buildStore) ------------------------------
const saved = buildStore.load();
const state = {
  familyKey: ((saved?.familyKey as FamKey) ?? "square") as FamKey,
  materialKey: saved?.materialKey ?? "alu",
  maxRpm: saved?.maxRpm ?? 15000,
  roles: saved?.roles?.length ? saved.roles : applicableRoleKeys("square"),
  anchors: { ...cloneAnchors(), ...(saved?.anchors ?? {}) },
  blanks: (saved?.blanks?.length ? saved.blanks : parseToolsJson(JSON.parse(sampleRaw))) as ToolBlank[],
  source: saved?.source || "sample · Helical_H45AL-3.tools",
  libName: saved?.libName || "Helical_H45AL-3",
  role: "" as string,
};
const anchorRoles = (): string[] => ROLE_CATALOG.map((r) => r.key).filter((k) => state.roles.includes(k) && state.anchors[k]);
state.role = anchorRoles()[0] ?? "Adaptive_Rough";

const GRID = { min: 2, max: 9, step: 0.5 };
const baseFamily = (k: FamKey): FamilyDef => (k === "square" ? defaultSquareFamily() : defaultBallFamily());
const familyDiameters = (): number[] => [...new Set(state.blanks.map((b) => b.diameter))].sort((a, b) => a - b);
const familyFlutes = (): number => state.blanks[0]?.flutes ?? 3;
const sfm = (): number => materialByKey(state.materialKey).sfm;

function family(): FamilyDef {
  const base = baseFamily(state.familyKey);
  const mat = materialByKey(state.materialKey);
  const g = geoKey(base.geometry);
  const roles = state.roles.map((k) => roleSpec(k, g)).filter(Boolean) as RoleSpec[];
  return { ...base, prefix: mat.prefix, sfm: mat.sfm, material: mat.label, calibrated: mat.calibrated, maxRpm: state.maxRpm, roles, anchorByKey: new Map(Object.entries(state.anchors)) };
}

function persist() {
  const prev = buildStore.load();
  buildStore.save({
    familyKey: state.familyKey, materialKey: state.materialKey, maxRpm: state.maxRpm,
    roles: state.roles, anchors: state.anchors, blanks: state.blanks,
    source: state.source, libName: state.libName,
    coatingFilter: prev?.coatingFilter ?? "all", sel: prev?.sel ?? 0,
  });
}

// per-L/D derating for the selected preset
function derateAt(r: number) {
  const a = state.anchors[state.role];
  return derate3({ radialPct: a.radialPct, chipLoadPct: a.chipLoadPct }, defaultBounds(a), a.exponent, ANCHOR_R0, r);
}
const gridRows = (): number[] => {
  const out: number[] = [];
  for (let r = GRID.min; r <= GRID.max + 1e-9; r += GRID.step) out.push(+r.toFixed(4));
  if (!out.some((r) => Math.abs(r - ANCHOR_R0) < 1e-6)) out.push(ANCHOR_R0);
  return out.sort((a, b) => a - b);
};

// ---- shell -----------------------------------------------------------------
const app = document.getElementById("app")!;
app.innerHTML = `
  <aside class="panel">
    <a class="bz-back" href="./index.html">← Build Library</a> · <a class="bz-back" href="./deflection.html">Deflection</a>
    <h1>Lever Model</h1>
    <div class="sub">Per-preset — tune the anchor tool, interpolate the family by stickout L/D.</div>
    <div id="panelBody"></div>
  </aside>
  <main class="main">
    <div class="toolbar">
      <span class="title" id="famTitle"></span>
      <span style="flex:1"></span>
      <input id="libName" class="bz-name" value="" placeholder="library name" spellcheck="false" />
      <span class="bz-sub">.json</span>
      <button class="btn" id="resetAnchors">Reset to sheet</button>
      <button class="btn primary" id="dlLib">Download library</button>
    </div>
    <div id="gridWrap"></div>
    <div class="panes" id="panes"></div>
    <p class="assumption">
      The lever derates each preset by <b>stickout L/D (reach/Ø)</b> from its anchor: radial and chip come down
      together, then axial gives once both hit their floors. Exponent <b>m</b> sets the steepness — m=3 holds
      deflection roughly constant (bend ∝ load × L³), m=4 holds it lower (finish), m=2 lets it ride (heavy).
      This is a first-order static budget: it doesn't predict chatter or absolute deflection — bench-check when chasing a tolerance.
    </p>
  </main>`;

// ---- side panel ------------------------------------------------------------
function renderPanel() {
  const a = state.anchors[state.role];
  const roleOpts = anchorRoles().map((k) => `<option value="${k}" ${k === state.role ? "selected" : ""}>${k.replace(/_/g, " ")}</option>`).join("");
  const chip = a.chipFixedIn != null
    ? `<div class="field"><label>Chip load (fixed, in/tooth)</label><input type="number" step="0.0005" data-af="chipFixedIn" value="${a.chipFixedIn}"></div>`
    : `<div class="field"><label>Chip load fz0 %</label><input type="number" step="0.05" data-af="chip" value="${+(a.chipLoadPct * 100).toFixed(3)}"></div>`;
  document.getElementById("panelBody")!.innerHTML = `
    <section>
      <h2>Preset</h2>
      <div class="field"><label>Which preset to tune</label><select id="roleSel">${roleOpts}</select></div>
    </section>
    <section>
      <h2>Anchor tool (r0 = ${ANCHOR_R0} stickout L/D · ${sfm()} SFM)</h2>
      <div class="field"><label>Radial ae0 %</label><input type="number" step="1" data-af="radial" value="${+(a.radialPct * 100).toFixed(1)}"></div>
      ${chip}
      <div class="field"><label>Axial factor (×${a.axial.base === "flute" ? "flute" : "Ø"})</label><input type="number" step="0.05" data-af="axialFactor" value="${a.axial.factor}"></div>
      <div class="field"><label>Axial basis</label><select data-af="axialBase"><option value="flute" ${a.axial.base === "flute" ? "selected" : ""}>flute length</option><option value="dia" ${a.axial.base === "dia" ? "selected" : ""}>diameter</option></select></div>
    </section>
    <section>
      <h2>Exponent m — deflection control</h2>
      <div class="seg">
        <button data-exp="2" class="${a.exponent === 2 ? "on" : ""}">2 · heavy</button>
        <button data-exp="3" class="${a.exponent === 3 ? "on" : ""}">3 · equal defl.</button>
        <button data-exp="4" class="${a.exponent === 4 ? "on" : ""}">4 · finish</button>
      </div>
      <div class="seg-note">higher m = derates harder on long tools = less deflection</div>
      <div class="field"><label>m (fractional)</label><input type="number" step="0.1" data-af="exponent" value="${a.exponent}"></div>
    </section>
    <section>
      <h2>Family</h2>
      <div class="field"><label>Max spindle RPM</label><input type="number" step="500" data-af="maxRpm" value="${state.maxRpm}"></div>
      <div class="field"><label>Tools</label><span class="derived">${state.blanks.length} · ${familyDiameters().length} Ø · ${familyFlutes()}FL</span></div>
      <div class="sub" style="margin-top:6px">${state.source}</div>
    </section>`;
}

// ---- grid ------------------------------------------------------------------
function renderGrid() {
  const dias = familyDiameters();
  const z = familyFlutes();
  const a = state.anchors[state.role];
  const rows = gridRows();
  const diaGroups = dias.map((d) => `<th class="grp dia" colspan="2">Ø ${d}"</th>`).join("");
  const diaCols = dias.map(() => `<th>feed ipm</th><th>stepover</th>`).join("");

  const body = rows.map((r) => {
    const d = derateAt(r);
    const isAnchor = Math.abs(r - ANCHOR_R0) < 1e-6;
    const isWarn = d.stage === "axial";
    const effAx = +(a.axial.factor * d.axialFrac).toFixed(3);
    const dcells = dias.map((D) => {
      const rpm = Math.min(state.maxRpm, (sfm() * 12) / (Math.PI * D));
      const chipIn = a.chipFixedIn != null ? a.chipFixedIn : d.fz * D;
      const feed = rpm * z * chipIn;
      const stepover = d.ae * D;
      return `<td class="dia">${num1(feed)}</td><td class="dia">${len3(stepover)}</td>`;
    }).join("");
    return `<tr class="${isAnchor ? "anchor" : ""} ${isWarn ? "warn" : ""}">
      <td class="shared ld">${r.toFixed(2)}</td>
      <td class="shared">${pct1(d.ae)}</td>
      <td class="shared">${a.chipFixedIn != null ? `${a.chipFixedIn}″` : pct2(d.fz)}</td>
      <td class="shared">${effAx}×${a.axial.base === "flute" ? "flute" : "Ø"}</td>
      <td class="shared status"><span class="status-pill">${d.stage}</span></td>
      ${dcells}
    </tr>`;
  }).join("");

  document.getElementById("gridWrap")!.innerHTML = `
    <h3 class="bz-h3">${state.role.replace(/_/g, " ")} — across the family</h3>
    <table class="params">
      <thead>
        <tr><th class="grp shared" colspan="5">Shared (ratio) — depends only on L/D</th>${diaGroups}</tr>
        <tr><th>L/D</th><th>radial %D</th><th>chip %D</th><th>axial</th><th>stage</th>${diaCols}</tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

function renderPanes() {
  const rows = gridRows();
  const aes = rows.map((r) => derateAt(r).ae);
  const fzs = rows.map((r) => derateAt(r).fz);
  const axs = rows.map((r) => derateAt(r).axialFrac);
  const a = state.anchors[state.role];
  const lever = lineChart({
    title: `${state.role.replace(/_/g, " ")} — radial %D, chip %D & axial× vs stickout L/D`,
    xs: rows, xlabel: "stickout L/D (reach/Ø)", markerX: ANCHOR_R0,
    series: [
      { name: "radial %D", color: "#4ea1ff", ys: aes, refMax: defaultBounds(a).radialCapPct, fmt: pct1 },
      { name: "chip %D", color: "#e0a93b", ys: fzs, refMax: defaultBounds(a).chipLoadCapPct, fmt: pct2 },
      { name: "axial ×", color: "#6ee7a0", ys: axs, refMax: 1, fmt: (v) => v.toFixed(2) },
    ] as Series[],
  });
  document.getElementById("panes")!.innerHTML = `<div class="card" style="grid-column:1 / -1">${lever}</div>`;
}

// ---- recompute + render ----------------------------------------------------
function render() {
  document.getElementById("famTitle")!.textContent = `${baseFamily(state.familyKey).name}`;
  (document.getElementById("libName") as HTMLInputElement).value = state.libName;
  renderPanel();
  renderGrid();
  renderPanes();
  persist();
}

// ---- events ----------------------------------------------------------------
app.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.id === "roleSel") { state.role = el.value; render(); return; }
  if (el.id === "libName") { state.libName = el.value; persist(); return; }
  const f = el.dataset.af;
  if (f) {
    const a = state.anchors[state.role];
    if (f === "axialBase") { a.axial.base = el.value as any; render(); return; }
    const v = parseFloat(el.value);
    if (isNaN(v)) return;
    if (f === "radial") a.radialPct = v / 100;
    else if (f === "chip") a.chipLoadPct = v / 100;
    else if (f === "chipFixedIn") a.chipFixedIn = v;
    else if (f === "axialFactor") a.axial.factor = v;
    else if (f === "exponent") a.exponent = v;
    else if (f === "maxRpm") state.maxRpm = v;
    render();
  }
});

app.addEventListener("click", (e) => {
  const el = e.target as HTMLElement;
  if (el.dataset.exp) { state.anchors[state.role].exponent = parseFloat(el.dataset.exp); render(); return; }
  if (el.id === "resetAnchors") { state.anchors = cloneAnchors(); render(); return; }
  if (el.id === "dlLib") {
    const lib = buildLibrary(state.blanks, family());
    const fn = `${(state.libName || "ToolLibrary").replace(/[^\w.\-]+/g, "_")}.json`;
    download(fn, JSON.stringify(sortDeep(lib), null, 1), "application/json");
  }
});

render();
