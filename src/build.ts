// build.ts — the Build-Library workflow: pick a family → drop a geometry file → set max
// RPM + cutting roles → generate a Fusion tool library as .json (geometry + ER holders + model-
// driven, lever-derated presets) → preview → download. All generation is in generate/*.
import { parseGeometry, parseToolsJson, nonMillableCount } from "./generate/ingest";
import {
  buildLibrary, defaultSquareFamily, defaultBallFamily,
  type FamilyDef, type ToolBlank,
} from "./generate/library";
import { pickEr } from "./generate/holders";
import { ALU_ANCHORS, ANCHOR_R0, type RoleAnchor } from "./generate/anchors";
import { verifyReport } from "./generate/verify";
import { MATERIALS, materialByKey } from "./generate/materials";
import { GROUPS, ROLE_CATALOG, appliesTo, roleSpec, applicableRoleKeys, geoKey, type RoleSpec } from "./generate/roles";
import { download } from "./exporters";

// Recursively sort object keys (Fusion serializes keys alphabetically; match it on export).
function sortDeep(x: any): any {
  if (Array.isArray(x)) return x.map(sortDeep);
  if (x && typeof x === "object") return Object.fromEntries(Object.keys(x).sort().map((k) => [k, sortDeep(x[k])]));
  return x;
}
import sampleRaw from "./generate/__fixtures__/Helical_H45AL-3.tools?raw";

type FamKey = "square" | "ball";
const baseFamily = (k: FamKey): FamilyDef => (k === "square" ? defaultSquareFamily() : defaultBallFamily());

// Editable working copy of the standard anchors (Tim's sheet). The anchor-tuning panel
// mutates these; generation reads them via family().anchorByKey.
const cloneAnchors = (): Record<string, RoleAnchor> =>
  Object.fromEntries(ALU_ANCHORS.map((a) => [a.key, { ...a, axial: { ...a.axial } }]));

const state = {
  familyKey: "square" as FamKey,
  materialKey: "alu",
  maxRpm: 15000,
  roles: new Set(applicableRoleKeys("square")),
  anchors: cloneAnchors(),
  blanks: [] as ToolBlank[],
  source: "",
  libName: "",
  coatingFilter: "all",
  error: "",
  lib: null as null | { version: number; data: any[] },
  sel: 0,
};

const availableCoatings = () => [...new Set(state.blanks.map((b) => b.coating).filter(Boolean))] as string[];
const selectedBlanks = () => (state.coatingFilter === "all" ? state.blanks : state.blanks.filter((b) => (b.coating ?? "") === state.coatingFilter));

function family(): FamilyDef {
  const base = baseFamily(state.familyKey);
  const mat = materialByKey(state.materialKey);
  const g = geoKey(base.geometry);
  const roles = [...state.roles].map((k) => roleSpec(k, g)).filter(Boolean) as RoleSpec[];
  const anchorByKey = new Map(Object.entries(state.anchors));
  return { ...base, prefix: mat.prefix, sfm: mat.sfm, material: mat.label, calibrated: mat.calibrated, maxRpm: state.maxRpm, roles, anchorByKey };
}

const sanitizeName = (s: string) => s.trim().replace(/[^\w.\-]+/g, "_").replace(/^_+|_+$/g, "");
const inch = (v: number, d = 4) => (typeof v === "number" ? `${+v.toFixed(d)}"` : "—");
const rpm = (v: number) => `${Math.round(v)}`;
const ipm = (v: number) => `${+v.toFixed(1)}`;

function holderSummary(blanks: ToolBlank[]): string {
  const t = baseFamily(state.familyKey).holderThresholds;
  const c = new Map<number, number>();
  for (const b of blanks) c.set(pickEr(b.diameter, t), (c.get(pickEr(b.diameter, t)) ?? 0) + 1);
  return [16, 20, 25, 32, 40].filter((e) => c.get(e)).map((e) => `ER${e}: ${c.get(e)}`).join(" · ");
}

function loadBlanks(blanks: ToolBlank[], source: string) {
  state.blanks = blanks;
  state.source = source;
  state.lib = null;
  state.sel = 0;
  state.coatingFilter = "all";
  state.error = "";
  render();
}

async function loadFile(file: File) {
  const text = await file.text();
  try {
    const blanks = parseGeometry(file.name, text);
    if (!blanks.length) {
      state.blanks = []; state.lib = null;
      state.error = `No millable tools found in “${file.name}”. Expected an end-mill CSV (cutter Ø, LOC, OAL, flutes…) or a Fusion .json/.tools library.`;
      render();
      return;
    }
    let skipped = 0;
    try { skipped = nonMillableCount(JSON.parse(text)); } catch { /* CSV — no skip count */ }
    const tag = `${file.name} (${(file.size / 1024).toFixed(0)} KB)` + (skipped ? ` · skipped ${skipped} non-millable (probes/taps/…)` : "");
    state.libName = sanitizeName(file.name.replace(/\.[^.]+$/, "")) || "ToolLibrary";
    loadBlanks(blanks, tag);
  } catch (e) {
    state.blanks = []; state.lib = null;
    state.error = `Couldn't read “${file.name}”: ${(e as Error).message}`;
    render();
  }
}

function generate() {
  const bl = selectedBlanks();
  if (!bl.length) { state.error = "Nothing to generate — check the coating filter."; render(); return; }
  state.error = "";
  state.lib = buildLibrary(bl, family());
  state.sel = 0;
  render();
}

// Live re-interpolation: if a library is already generated, rebuild it in place so anchor
// tweaks (and role/RPM changes) flow straight into the preview.
function regen() {
  if (!state.lib) return;
  const bl = selectedBlanks();
  if (bl.length) state.lib = buildLibrary(bl, family());
}

// ---- render ----------------------------------------------------------------
const app = document.getElementById("app")!;

function rolesPanel(): string {
  const g = geoKey(baseFamily(state.familyKey).geometry);
  const head = `<div class="bz-rolebtns"><button class="bz-mini" id="rolesAll" type="button">Select all</button><button class="bz-mini" id="rolesNone" type="button">Clear</button></div>`;
  return head + GROUPS.map((grp) => {
    const rows = ROLE_CATALOG.filter((r) => r.group === grp)
      .map((r) => {
        const ok = appliesTo(r.key, g);
        return `<label class="rolechk ${ok ? "" : "na"}"><input type="checkbox" data-role="${r.key}" ${state.roles.has(r.key) && ok ? "checked" : ""} ${ok ? "" : "disabled"}/> ${r.key.replace(/_/g, " ")}${ok ? "" : " <span class='na-tag'>n/a</span>"}</label>`;
      })
      .join("");
    return `<div class="rolegroup"><div class="rolegroup-h">${grp}</div>${rows}</div>`;
  }).join("");
}

// Anchor-tuning panel: the sheet values populate here as editable fields for each selected
// role; edits re-interpolate the whole family live (Tim's Phase-3 workflow, 2026-07-01).
function anchorPanel(): string {
  const keys = ROLE_CATALOG.map((r) => r.key).filter((k) => state.roles.has(k) && state.anchors[k]);
  if (!keys.length) return "";
  const mat = materialByKey(state.materialKey);
  const rows = keys
    .map((k) => {
      const a = state.anchors[k];
      const chip = a.chipFixedIn != null
        ? `<span class="bz-fixed" title="fixed chip load — not %D">${a.chipFixedIn}″</span>`
        : `<input class="bz-anum" type="number" step="0.05" min="0" data-anchor="${k}" data-field="chip" value="${+(a.chipLoadPct * 100).toFixed(3)}" />`;
      return `<tr>
        <td class="bz-arole">${k.replace(/_/g, " ")}</td>
        <td><input class="bz-anum" type="number" step="1" min="0" max="100" data-anchor="${k}" data-field="radial" value="${+(a.radialPct * 100).toFixed(1)}" /></td>
        <td>${chip}</td>
        <td><input class="bz-anum" type="number" step="0.05" min="0" data-anchor="${k}" data-field="axialFactor" value="${a.axial.factor}" /><span class="bz-axbase">×${a.axial.base === "flute" ? "flute" : "Ø"}</span></td>
        <td><input class="bz-anum bz-anum-m" type="number" step="1" min="2" max="6" data-anchor="${k}" data-field="exponent" value="${a.exponent}" /></td>
      </tr>`;
    })
    .join("");
  return `<div class="bz-anchor">
    <div class="bz-anchor-h">
      <h3 class="bz-h3">Anchor tuning <span class="bz-sub">values at the anchor tool (stickout L/D ${ANCHOR_R0}, ${mat.sfm} SFM) — the family interpolates from here</span></h3>
      <button class="bz-mini" id="anchorReset" type="button">Reset to sheet</button>
    </div>
    <div class="bz-tablewrap"><table class="bz-table bz-atable">
      <thead><tr><th>Role</th><th>Radial&nbsp;%D</th><th>Chip&nbsp;%D</th><th>Axial</th><th>m</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div class="bz-note">Edit any value — the preview re-interpolates across every tool. Radial/chip are the anchor engagements; <b>m</b> sets how steeply they derate on longer tools (2 = gentle, 4 = steep / least deflection).</div>
  </div>`;
}

function previewTable(): string {
  if (!state.lib) {
    return `<div class="bz-empty">Drop a geometry file (or load the sample), then <b>Generate</b> to preview the library here.</div>`;
  }
  const data = state.lib.data;
  const rows = data
    .map((t, i) => {
      const g = t.geometry;
      const er = /ER\d+/i.exec(t.holder?.description ?? "")?.[0] ?? "—";
      return `<tr class="bz-trow ${i === state.sel ? "on" : ""}" data-ti="${i}">
        <td>${i + 1}</td>
        <td class="bz-desc" title="${(t.description ?? "").replace(/"/g, "&quot;")}">${t.description ?? t["product-id"]}</td>
        <td>${inch(g.DC, 3)}</td>
        <td>${t.grade ?? "—"}</td>
        <td>${er}</td>
        <td>${inch(g.LCF, 3)}</td>
        <td>${inch(g.OAL, 3)}</td>
        <td>${t["start-values"].presets.length}</td>
      </tr>`;
    })
    .join("");

  const sel = data[state.sel];
  const presets = sel
    ? sel["start-values"].presets
        .map(
          (p: any) => `<tr>
        <td class="bz-pname">${p.name}</td>
        <td>${rpm(p.n)} rpm</td>
        <td>${ipm(p.v_f)} ipm</td>
        <td>${+p.f_z.toFixed(5)}"</td>
        <td>${typeof p.stepdown === "number" ? inch(p.stepdown) : "—"}</td>
        <td>${typeof p.stepover === "number" ? inch(p.stepover) : "—"}</td>
      </tr>`,
        )
        .join("")
    : "";

  return `
    <div class="bz-stats">✓ Generated <b>${data.length}</b> tools · <b>${data.reduce((a, t) => a + t["start-values"].presets.length, 0)}</b> presets
      <span style="flex:1"></span>
      <input id="libName" class="bz-name" value="${sanitizeName(state.libName)}" placeholder="library name" spellcheck="false" />
      <span class="bz-sub">.json</span>
      <button class="btn primary" id="dlBtn">Download</button></div>
    <div class="bz-tablewrap"><table class="bz-table">
      <thead><tr><th>#</th><th>Description</th><th>Ø</th><th>Coating</th><th>Holder</th><th>Flute</th><th>OAL</th><th>Presets</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <h3 class="bz-h3">Presets — ${sel?.description ?? ""}</h3>
    <div class="bz-tablewrap"><table class="bz-table">
      <thead><tr><th>Role</th><th>Spindle</th><th>Feed</th><th>Feed/tooth</th><th>Stepdown</th><th>Stepover</th></tr></thead>
      <tbody>${presets}</tbody>
    </table></div>
    ${verifyPanel()}`;
}

function verifyPanel(): string {
  if (!state.lib) return "";
  const r = verifyReport(state.lib);
  const flags = r.flags.map((f) => `<li><span class="bz-flagn">${f.count}</span> ${f.label}</li>`).join("");
  const label = ["shortest", "mid", "longest"];
  const spot = r.spotCheck
    .map((s, i) => `<button class="bz-spot ${s.index === state.sel ? "on" : ""}" data-ti="${s.index}">${label[i] ?? ""} reach · L/D ${s.ld}<span class="bz-spot-d">${(s.description.split(" - ")[0]).replace(/"/g, "&quot;")}</span></button>`)
    .join("");
  return `<div class="bz-verify">
    <h3 class="bz-h3">Spot-check before you cut</h3>
    <div class="bz-note">Click a tool to inspect its presets above. Check the stiffness spread — the lever derates hardest at the longest reach. Feeds &amp; speeds are your tuned anchors interpolated across the family.</div>
    <div class="bz-spots">${spot}</div>
    ${flags ? `<div class="bz-note" style="margin-top:12px">Presets leaning on model / engineering defaults:</div><ul class="bz-flags">${flags}</ul>` : ""}
  </div>`;
}

function render() {
  const base = baseFamily(state.familyKey);
  const mat = materialByKey(state.materialKey);
  const t = base.holderThresholds;
  app.innerHTML = `
    <div class="bz-nav">
      <span class="bz-brand">Tool Family Configurator</span>
      <span class="bz-tab on">Build Library</span>
      <a class="bz-tab" href="./lever.html">Lever Model</a>
      <a class="bz-tab" href="./deflection.html">Deflection</a>
    </div>
    <div class="bz-wrap">
      <aside class="bz-panel">
        <section>
          <h2>1 · Family</h2>
          <select id="famSel" class="bz-input">
            <option value="square" ${state.familyKey === "square" ? "selected" : ""}>Helical H45AL-3 — Square (aluminum)</option>
            <option value="ball" ${state.familyKey === "ball" ? "selected" : ""}>Helical H35AL-3 — Ball (aluminum)</option>
          </select>
          <div class="bz-note">${base.vendor} · ${base.geometry} geometry</div>
        </section>
        <section>
          <h2>2 · Geometry source</h2>
          <div class="bz-drop" id="drop">
            <div><b>Drop a file</b> or click</div>
            <div class="bz-sub">.csv · .json (.tools also accepted)</div>
          </div>
          <input type="file" id="fileInput" accept=".tools,.json,.csv" hidden />
          <button class="btn" id="sampleBtn">Load sample (H45AL-3)</button>
          ${state.error ? `<div class="bz-error">${state.error}</div>` : ""}
          ${state.blanks.length ? `<div class="bz-parsed">Parsed <b>${state.blanks.length}</b> tools<div class="bz-sub">${state.source}</div><div class="bz-holders">${holderSummary(state.blanks)}</div>${availableCoatings().length > 1 ? `<div class="bz-rolelabel">Coatings</div><div class="seg bz-coats" id="coatFilter"><button data-coat="all" class="${state.coatingFilter === "all" ? "on" : ""}">All</button>${availableCoatings().map((c) => `<button data-coat="${c}" class="${state.coatingFilter === c ? "on" : ""}">${c}</button>`).join("")}</div>` : ""}</div>` : ""}
        </section>
        <section>
          <h2>3 · Material & cutting roles</h2>
          <select id="matSel" class="bz-input">
            ${MATERIALS.filter((m) => m.calibrated).map((m) => `<option value="${m.key}" ${state.materialKey === m.key ? "selected" : ""}>${m.label} (${m.prefix})</option>`).join("")}
          </select>
          <div class="bz-note">${mat.sfm} SFM${mat.calibrated ? "" : " · ⚠ starting point — calibrate before use"}</div>
          <label class="bz-row" style="margin-top:10px"><span>Max spindle RPM</span><input type="number" id="maxRpm" class="bz-num" value="${state.maxRpm}" step="500" min="1000" /></label>
          <div class="bz-rolelabel">Cutting roles — preset = <b>${mat.prefix}</b>_Role</div>
          ${rolesPanel()}
          <div class="bz-note">Holders by Ø: ER16 ≤${t.er16Max}" · ER25 &lt;${t.er25MaxExcl}" · ER32 ≤${t.er32Max}" · ER40 &gt;${t.er32Max}"</div>
        </section>
        <button class="btn primary bz-gen" id="genBtn" ${state.blanks.length ? "" : "disabled"}>Generate library →</button>
      </aside>
      <main class="bz-main">${state.blanks.length ? anchorPanel() : ""}${previewTable()}</main>
    </div>`;
}

// ---- events (delegated, bound once) ----------------------------------------
app.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.id === "famSel") {
    state.familyKey = el.value as FamKey;
    state.roles = new Set(applicableRoleKeys(baseFamily(state.familyKey).geometry));
    state.lib = null;
    render();
  } else if (el.id === "libName") {
    state.libName = el.value;
  } else if (el.id === "matSel") {
    state.materialKey = el.value;
    state.lib = null;
    render();
  } else if (el.dataset.role) {
    el.checked ? state.roles.add(el.dataset.role) : state.roles.delete(el.dataset.role);
    regen(); render(); // refresh the anchor panel + preview to match the role selection
  } else if (el.dataset.anchor) {
    const a = state.anchors[el.dataset.anchor];
    const v = parseFloat(el.value);
    if (a && !isNaN(v)) {
      const f = el.dataset.field;
      if (f === "radial") a.radialPct = v / 100;
      else if (f === "chip") a.chipLoadPct = v / 100;
      else if (f === "axialFactor") a.axial.factor = v;
      else if (f === "exponent") a.exponent = v;
      regen(); render();
    }
  } else if (el.id === "maxRpm") {
    const v = parseInt(el.value);
    if (!isNaN(v)) state.maxRpm = v;
  } else if (el.id === "fileInput" && el.files?.[0]) {
    loadFile(el.files[0]);
  }
});

app.addEventListener("click", (e) => {
  const el = e.target as HTMLElement;
  const coat = el.closest("[data-coat]") as HTMLElement | null;
  if (coat) { state.coatingFilter = coat.dataset.coat!; state.lib = null; render(); return; }
  if (el.id === "rolesAll") { state.roles = new Set(applicableRoleKeys(baseFamily(state.familyKey).geometry)); regen(); render(); return; }
  if (el.id === "rolesNone") { state.roles = new Set(); regen(); render(); return; }
  if (el.id === "anchorReset") { state.anchors = cloneAnchors(); regen(); render(); return; }
  if (el.closest("#drop")) (document.getElementById("fileInput") as HTMLInputElement).click();
  else if (el.id === "sampleBtn") { state.libName = "Helical_H45AL-3"; loadBlanks(parseToolsJson(JSON.parse(sampleRaw)), "sample · Helical_H45AL-3.tools"); }
  else if (el.id === "genBtn") generate();
  else if (el.id === "dlBtn" && state.lib) {
    const inp = document.getElementById("libName") as HTMLInputElement | null;
    const fn = `${sanitizeName(inp?.value ?? state.libName) || "ToolLibrary"}.json`;
    download(fn, JSON.stringify(sortDeep(state.lib), null, 1), "application/json");
  } else {
    const pick = el.closest(".bz-trow, .bz-spot") as HTMLElement | null;
    if (pick?.dataset.ti != null) { state.sel = +pick.dataset.ti; render(); }
  }
});

app.addEventListener("dragover", (e) => {
  if ((e.target as HTMLElement).closest("#drop")) { e.preventDefault(); (e.target as HTMLElement).closest("#drop")!.classList.add("drag"); }
});
app.addEventListener("dragleave", (e) => {
  (e.target as HTMLElement).closest("#drop")?.classList.remove("drag");
});
app.addEventListener("drop", (e) => {
  const zone = (e.target as HTMLElement).closest("#drop");
  if (!zone) return;
  e.preventDefault();
  zone.classList.remove("drag");
  const f = (e as DragEvent).dataTransfer?.files?.[0];
  if (f) loadFile(f);
});

// boot — #sample auto-loads + generates the sample for a populated view.
if (location.hash === "#sample") {
  state.blanks = parseToolsJson(JSON.parse(sampleRaw));
  state.source = "sample · Helical_H45AL-3.tools";
  state.lib = buildLibrary(state.blanks, family());
}
render();
