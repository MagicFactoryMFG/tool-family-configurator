// app.ts — Tool Family Configurator UI. All cutting math lives in leverModel.ts (spec §8);
// this file only reads computed results and renders/handles input.
import {
  type ToolFamily,
  type ComputedRow,
  allocate,
  computeFamily,
  computeRow,
  referenceLD,
} from "./leverModel";
import helicalH45AL3 from "./families/helicalH45AL3";
import { localStore as store } from "./storage";
import { lineChart, type Series } from "./charts";
import { toExportJSON, toCSV, download } from "./exporters";
import { pct1, pct2, num1, len3 } from "./format";

// ---- state -----------------------------------------------------------------
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
let family: ToolFamily = store.load() ?? clone(helicalH45AL3);
const view = { cmpD1: 0, cmpD2: 0, atLD: 0 };

const get = (path: string): any => path.split(".").reduce((o: any, k) => o?.[k], family);
const set = (path: string, val: any) => {
  const ks = path.split(".");
  let o: any = family;
  for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
  o[ks[ks.length - 1]] = val;
};
const sortedDia = () => [...family.diameters].sort((a, b) => a - b);
const gridLDs = (): number[] => {
  try {
    return computeFamily(family).map((r) => r.ld);
  } catch {
    return [];
  }
};
const nearestLD = (target: number): number => {
  const lds = gridLDs();
  if (!lds.length) return target;
  return lds.reduce((best, x) => (Math.abs(x - target) < Math.abs(best - target) ? x : best), lds[0]);
};

// ---- shell -----------------------------------------------------------------
const app = document.getElementById("app")!;
app.innerHTML = `
  <aside class="panel">
    <a class="bz-back" href="./index.html">← Build Library</a> · <a class="bz-back" href="./deflection.html">Deflection</a>
    <h1>Tool Family Configurator</h1>
    <div class="sub">One calibration → a whole family, scaled by L/D.</div>
    <div id="panelBody"></div>
  </aside>
  <main class="main">
    <div class="toolbar">
      <span class="title" id="famTitle"></span>
      <button class="btn" id="clearOvr">Clear overrides</button>
      <button class="btn" id="reset">Reset to standard</button>
      <button class="btn" id="expCsv">Export analysis CSV</button>
      <button class="btn primary" id="expJson">Export analysis JSON</button>
    </div>
    <div id="validation" class="msg"></div>
    <div id="tableWrap"></div>
    <div class="legend-row" id="legend"></div>
    <div class="panes" id="panes"></div>
    <p class="assumption">
      Adaptive / high-efficiency model: <b>axial is pinned to the full flute</b> (axial %D = L/D),
      light-to-moderate radial. Not a slotting or full-immersion model — the radial cap is what keeps
      low-L/D radial sane, not a slotting recommendation. This is a first-order static force budget:
      it does not predict chatter (natural frequency falls with the square of reach) or absolute
      deflection. A larger tool at the same L/D pushes off more in absolute terms — tighten by hand
      when chasing an absolute tolerance.
    </p>
  </main>`;

// ---- side panel ------------------------------------------------------------
function fieldRow(label: string, key: string, kind: string, opts: any = {}): string {
  const val = get(key);
  if (kind === "select") {
    const o = (opts.options as string[]).map((op) => `<option ${op === val ? "selected" : ""}>${op}</option>`).join("");
    return `<div class="field"><label>${label}</label><select data-key="${key}" data-kind="str">${o}</select></div>`;
  }
  if (kind === "textarea") {
    return `<div class="field wide"><label>${label}</label><textarea data-key="${key}" data-kind="str">${val ?? ""}</textarea></div>`;
  }
  const shown = kind === "pct" ? +(val * 100).toFixed(4) : val;
  const type = kind === "str" ? "text" : "number";
  const step = opts.step ? `step="${opts.step}"` : kind === "pct" ? `step="0.1"` : "";
  const suffix = kind === "pct" ? " %" : opts.suffix ?? "";
  return `<div class="field ${opts.wide ? "wide" : ""}"><label>${label}${suffix}</label><input type="${type}" ${step} data-key="${key}" data-kind="${kind}" value="${shown ?? ""}"></div>`;
}

function renderPanel() {
  const k = family.knobs;
  const m = family.calibration;
  document.getElementById("panelBody")!.innerHTML = `
    <section>
      <h2>Family</h2>
      ${fieldRow("Name", "name", "str", { wide: true })}
      ${fieldRow("Vendor", "vendor", "str")}
      ${fieldRow("Geometry", "geometry", "select", { options: ["square", "ballnose", "bullnose", "chamfer", "other"] })}
      ${fieldRow("Flute count z", "fluteCount", "int", { step: 1 })}
      ${fieldRow("Coating", "coating", "str")}
      ${fieldRow("Material", "material", "str")}
      ${fieldRow("RPM", "rpm", "int", { step: 100 })}
      ${fieldRow("Notes", "notes", "textarea", { wide: true })}
    </section>
    <section>
      <h2>Calibration anchor</h2>
      ${fieldRow("Anchor Ø (in)", "calibration.anchorDiameter", "num", { step: 0.0625 })}
      ${fieldRow("Anchor length (in)", "calibration.anchorLength", "num", { step: 0.0625 })}
      ${fieldRow("Radial ae0", "calibration.radialPct", "pct")}
      ${fieldRow("Chip load fz0", "calibration.chipLoadPct", "pct")}
      <div class="field"><label>Reference L/D (r0)</label><span class="derived" id="r0val">${(referenceLD(m)).toFixed(2)}</span></div>
    </section>
    <section>
      <h2>Exponent m — what it protects</h2>
      <div class="seg">
        <button data-exp="2" class="${k.exponent === 2 ? "on" : ""}">2 · aggressive</button>
        <button data-exp="3" class="${k.exponent === 3 ? "on" : ""}">3 · general</button>
        <button data-exp="4" class="${k.exponent === 4 ? "on" : ""}">4 · finish</button>
      </div>
      <div class="seg-note">2: holds fracture margin · 3: balanced · 4: holds deflection/Ø flat</div>
      ${fieldRow("m (fractional)", "knobs.exponent", "num", { step: 0.1 })}
    </section>
    <section>
      <h2>Caps & floors</h2>
      ${fieldRow("Radial cap", "knobs.radialCapPct", "pct")}
      ${fieldRow("Radial floor", "knobs.radialFloorPct", "pct")}
      ${fieldRow("Chip load cap", "knobs.chipLoadCapPct", "pct")}
      ${fieldRow("Chip load floor", "knobs.chipLoadFloorPct", "pct")}
    </section>
    <section>
      <h2>L/D grid</h2>
      ${fieldRow("Min", "ldGrid.min", "num", { step: 0.5 })}
      ${fieldRow("Max", "ldGrid.max", "num", { step: 0.5 })}
      ${fieldRow("Step", "ldGrid.step", "num", { step: 0.5 })}
    </section>
    <section>
      <h2>Family diameters (in)</h2>
      ${fieldRow("Comma-separated", "diameters", "csv", { wide: true })}
    </section>`;
}

// ---- validation (spec §7) --------------------------------------------------
function validate(): string[] {
  const issues: string[] = [];
  const m = family.calibration;
  const k = family.knobs;
  if (m.radialPct > k.radialCapPct || m.radialPct < k.radialFloorPct)
    issues.push(`Anchor radial ${pct1(m.radialPct)} is outside its band [${pct1(k.radialFloorPct)}, ${pct1(k.radialCapPct)}].`);
  if (m.chipLoadPct > k.chipLoadCapPct || m.chipLoadPct < k.chipLoadFloorPct)
    issues.push(`Anchor chip load ${pct2(m.chipLoadPct)} is outside its band [${pct2(k.chipLoadFloorPct)}, ${pct2(k.chipLoadCapPct)}].`);
  const g = family.ldGrid;
  if (!(g.min > 0)) issues.push("L/D grid min must be > 0.");
  if (!(g.max > g.min)) issues.push("L/D grid max must be greater than min.");
  if (!(g.step > 0)) issues.push("L/D grid step must be > 0.");
  if (g.step > 0 && (g.max - g.min) / g.step > 400) issues.push("L/D grid produces too many rows — increase step.");
  if (!family.diameters.length) issues.push("Add at least one family diameter.");
  return issues;
}

// ---- main view -------------------------------------------------------------
function renderTable(rows: ComputedRow[]) {
  const dias = sortedDia();
  const diaGroups = dias.map((d) => `<th class="grp dia" colspan="3">Ø ${d}"</th>`).join("");
  const diaCols = dias.map(() => `<th>flute</th><th>feed</th><th>MRR</th>`).join("");

  const body = rows
    .map((r) => {
      const isAnchor = r.status === "anchor";
      const isWarn = r.status === "axial must give";
      const ovR = family.overrides.find((o) => Math.abs(o.ld - r.ld) < 1e-9 && o.radialPct !== undefined);
      const ovF = family.overrides.find((o) => Math.abs(o.ld - r.ld) < 1e-9 && o.chipLoadPct !== undefined);
      // per-diameter cells follow the sorted diameter order
      const dcells = dias
        .map((d) => {
          const pd = r.perDiameter.find((p) => p.diameter === d)!;
          return `<td class="dia">${len3(pd.fluteLen)}</td><td class="dia">${num1(pd.feedIpm)}</td><td class="dia">${num1(pd.mrr)}</td>`;
        })
        .join("");
      return `<tr class="${isAnchor ? "anchor" : ""} ${isWarn ? "warn" : ""}">
        <td class="shared ld">${r.ld.toFixed(2)}</td>
        <td class="shared">${r.axialPct.toFixed(2)}</td>
        <td class="shared">${(r.forceBudget * 1e4).toFixed(2)}</td>
        <td class="shared"><input class="ovr ${ovR ? "on" : ""}" data-ovr-ld="${r.ld}" data-ovr-field="radialPct" value="${(r.radialPct * 100).toFixed(1)}"></td>
        <td class="shared"><input class="ovr ${ovF ? "on" : ""}" data-ovr-ld="${r.ld}" data-ovr-field="chipLoadPct" value="${(r.chipLoadPct * 100).toFixed(2)}"></td>
        <td class="shared status"><span class="status-pill">${r.status}</span></td>
        ${dcells}
      </tr>`;
    })
    .join("");

  document.getElementById("tableWrap")!.innerHTML = `
    <table class="params">
      <thead>
        <tr>
          <th class="grp shared" colspan="6">Shared (ratio) — depends only on L/D</th>
          ${diaGroups}
        </tr>
        <tr>
          <th>L/D</th><th>axial %D</th><th>P·10⁴</th><th>radial %D</th><th>chip %D</th><th>status</th>
          ${diaCols}
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;

  document.getElementById("legend")!.innerHTML = `
    <span><span class="sw" style="background:rgba(78,161,255,.5)"></span>shared ratio block</span>
    <span><span class="sw" style="background:rgba(120,200,150,.5)"></span>per-diameter block</span>
    <span><span class="sw" style="background:var(--anchor)"></span>anchor row</span>
    <span><span class="sw" style="background:var(--ovr)"></span>override cell (type to edit, clear to revert)</span>
    <span><span class="sw" style="background:var(--warn)"></span>"axial must give" — back off the full-flute depth</span>`;
}

function renderPanes(rows: ComputedRow[]) {
  const dias = sortedDia();
  if (view.cmpD1 >= dias.length) view.cmpD1 = 0;
  if (view.cmpD2 >= dias.length) view.cmpD2 = Math.min(1, dias.length - 1);
  view.atLD = nearestLD(view.atLD || referenceLD(family.calibration));

  const opt = (sel: number) => dias.map((d, i) => `<option value="${i}" ${i === sel ? "selected" : ""}>${d}"</option>`).join("");
  const ldOpt = rows.map((r) => `<option value="${r.ld}" ${Math.abs(r.ld - view.atLD) < 1e-9 ? "selected" : ""}>${r.ld.toFixed(2)}</option>`).join("");

  // comparison at view.atLD
  const cmpRow = computeRow(family, view.atLD);
  const D1 = dias[view.cmpD1], D2 = dias[view.cmpD2];
  const p1 = cmpRow.perDiameter.find((p) => p.diameter === D1)!;
  const p2 = cmpRow.perDiameter.find((p) => p.diameter === D2)!;
  const feedRatio = p1.feedIpm ? p2.feedIpm / p1.feedIpm : NaN;
  const mrrRatio = p1.mrr ? p2.mrr / p1.mrr : NaN;
  const expFeed = D2 / D1;
  const expMrr = Math.pow(D2 / D1, 3);
  const ok = (a: number, b: number) => (Math.abs(a - b) < 1e-6 ? "cmp-ok" : "cmp-bad");

  // charts
  const lds = rows.map((r) => r.ld);
  const lever = lineChart({
    title: "Lever curves — radial %D and chip load %D vs L/D",
    xs: lds,
    xlabel: "L/D",
    markerX: referenceLD(family.calibration),
    series: [
      { name: "radial %D", color: "#4ea1ff", ys: rows.map((r) => r.radialPct), refMax: family.knobs.radialCapPct, fmt: pct1 },
      { name: "chip %D", color: "#e0a93b", ys: rows.map((r) => r.chipLoadPct), refMax: family.knobs.chipLoadCapPct, fmt: pct2 },
    ] as Series[],
  });
  const feeds = dias.map((d) => cmpRow.perDiameter.find((p) => p.diameter === d)!.feedIpm);
  const mrrs = dias.map((d) => cmpRow.perDiameter.find((p) => p.diameter === d)!.mrr);
  const scaling = lineChart({
    title: `Family scaling at L/D ${view.atLD.toFixed(2)} — feed & MRR vs Ø`,
    xs: dias,
    xlabel: "diameter (in)",
    series: [
      { name: "feed ipm", color: "#4ea1ff", ys: feeds, refMax: Math.max(...feeds), fmt: num1 },
      { name: "MRR in³/min", color: "#6ee7a0", ys: mrrs, refMax: Math.max(...mrrs), fmt: num1 },
    ] as Series[],
  });

  document.getElementById("panes")!.innerHTML = `
    <div class="card">
      <h3>Compare two diameters</h3>
      <div class="cmp-grid">
        <label>At L/D</label><select data-cmp="ld">${ldOpt}</select>
        <label>Diameter A</label><select data-cmp="d1">${opt(view.cmpD1)}</select>
        <label>Diameter B</label><select data-cmp="d2">${opt(view.cmpD2)}</select>
      </div>
      <p class="cmp-out">Feed ratio B/A = <b>${feedRatio.toFixed(3)}</b> &nbsp;<span class="${ok(feedRatio, expFeed)}">(expect Ø-ratio ${expFeed.toFixed(3)})</span></p>
      <p class="cmp-out">MRR ratio B/A = <b>${mrrRatio.toFixed(3)}</b> &nbsp;<span class="${ok(mrrRatio, expMrr)}">(expect Ø-ratio³ ${expMrr.toFixed(3)})</span></p>
    </div>
    <div class="card">${lever}</div>
    <div class="card" style="grid-column:1 / -1">${scaling}</div>`;
}

// ---- recompute + render ----------------------------------------------------
function recompute() {
  document.getElementById("famTitle")!.textContent = family.name;
  const r0el = document.getElementById("r0val");
  if (r0el) r0el.textContent = referenceLD(family.calibration).toFixed(2);

  const issues = validate();
  document.getElementById("validation")!.innerHTML = issues.length ? "⚠ " + issues.join(" ") : "";

  let rows: ComputedRow[] = [];
  try {
    rows = computeFamily(family);
  } catch {
    document.getElementById("tableWrap")!.innerHTML = `<p class="msg">Fix the L/D grid to generate the table.</p>`;
    document.getElementById("panes")!.innerHTML = "";
    document.getElementById("legend")!.innerHTML = "";
    return;
  }
  renderTable(rows);
  renderPanes(rows);
  store.save(family);
}

// ---- overrides -------------------------------------------------------------
function commitOverride(ld: number, field: "radialPct" | "chipLoadPct", raw: string) {
  let entry = family.overrides.find((o) => Math.abs(o.ld - ld) < 1e-9);
  const base = allocate(family.calibration, family.knobs, ld);
  const baseVal = field === "radialPct" ? base.ae : base.fz;
  const clearField = () => {
    if (!entry) return;
    delete entry[field];
    if (entry.radialPct === undefined && entry.chipLoadPct === undefined)
      family.overrides = family.overrides.filter((o) => o !== entry);
  };
  if (raw.trim() === "") {
    clearField();
  } else {
    const frac = parseFloat(raw) / 100;
    if (isNaN(frac)) return;
    if (Math.abs(frac - baseVal) < 1e-9) {
      clearField();
    } else {
      if (!entry) {
        entry = { ld };
        family.overrides.push(entry);
      }
      entry[field] = frac;
    }
  }
  store.save(family);
  recompute();
}

// ---- events (delegated) ----------------------------------------------------
app.addEventListener("input", (e) => {
  const t = e.target as HTMLElement;
  if (t.matches("[data-key]")) {
    const el = t as HTMLInputElement;
    const key = el.dataset.key!, kind = el.dataset.kind!;
    let v: any;
    if (kind === "str") v = el.value;
    else if (kind === "csv") v = el.value.split(",").map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n) && n > 0).sort((a, b) => a - b);
    else if (kind === "int") { v = Math.round(parseFloat(el.value)); if (isNaN(v)) return; }
    else if (kind === "pct") { const n = parseFloat(el.value); if (isNaN(n)) return; v = n / 100; }
    else { v = parseFloat(el.value); if (isNaN(v)) return; }
    set(key, v);
    recompute();
  }
});

app.addEventListener("change", (e) => {
  const t = e.target as HTMLElement;
  if (t.matches("input.ovr")) {
    const el = t as HTMLInputElement;
    commitOverride(parseFloat(el.dataset.ovrLd!), el.dataset.ovrField as any, el.value);
  } else if (t.matches("[data-cmp]")) {
    const el = t as HTMLSelectElement;
    const which = el.dataset.cmp!;
    if (which === "ld") view.atLD = parseFloat(el.value);
    else if (which === "d1") view.cmpD1 = parseInt(el.value);
    else if (which === "d2") view.cmpD2 = parseInt(el.value);
    recompute();
  }
});

app.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  if (t.matches("[data-exp]")) {
    family.knobs.exponent = parseFloat((t as HTMLElement).dataset.exp!);
    renderPanel();
    recompute();
  } else if (t.id === "reset") {
    family = clone(helicalH45AL3);
    view.cmpD1 = 0; view.cmpD2 = 1; view.atLD = referenceLD(family.calibration);
    store.save(family);
    renderPanel();
    recompute();
  } else if (t.id === "clearOvr") {
    family.overrides = [];
    store.save(family);
    recompute();
  } else if (t.id === "expJson") {
    download(`${family.id || "family"}.json`, JSON.stringify(toExportJSON(family, computeFamily(family)), null, 2), "application/json");
  } else if (t.id === "expCsv") {
    download(`${family.id || "family"}.csv`, toCSV(family, computeFamily(family)), "text/csv");
  }
});

// ---- boot ------------------------------------------------------------------
view.cmpD1 = 0;
view.cmpD2 = Math.min(1, family.diameters.length - 1);
view.atLD = referenceLD(family.calibration);
renderPanel();
recompute();
