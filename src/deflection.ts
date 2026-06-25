// deflection.ts — "Why longer tools deflect more" explainer page. Relative to a stiff 2×D
// baseline, deflection grows with the cube of stickout; the exponent m (lever model) buys
// powers of that cube back. Pure UI; mirrors the lever model's m setting.
const BASE = 2;
const EXP: Record<string, number> = { same: 3, "2": 2, "3": 1, "4": 0 };
const GREEN = "#6ee7a0", AMBER = "#e0a93b", RED = "#ff9b86";
const LAW: Record<string, string> = {
  same: "No derating: deflection rises with the <em>cube</em> of stickout — double the length, about 8× the deflection.",
  "2": "m = 2 eases the cut just enough to hold the cube down to a <em>square</em> — double the length, about 4×. Guards against breakage.",
  "3": "m = 3 eases it more, so deflection grows <em>linearly</em> — double the length, about 2×. The balanced default.",
  "4": "m = 4 eases it enough to hold deflection <em>flat</em> — a long tool deflects like the 2×D baseline. Best for tolerance, lowest MRR.",
};

const app = document.getElementById("app")!;
app.innerHTML = `
  <div class="bz-nav">
    <span class="bz-brand">Tool Family Configurator</span>
    <a class="bz-tab" href="./index.html">Build Library</a>
    <a class="bz-tab" href="./lever.html">Lever Model</a>
    <span class="bz-tab on">Deflection</span>
  </div>
  <div class="def-page">
    <h1>Why longer tools deflect more</h1>
    <p class="def-intro">A tool is a cantilever clamped in the holder. Tip deflection grows with the <em>cube</em> of how far it sticks out — and the lever model's exponent <code>m</code> decides how much of that you buy back by easing the cut.</p>

    <div class="def-row">
      <label for="ld">Stickout (L/D)</label>
      <input type="range" id="ld" min="2" max="8" step="0.5" value="2" />
      <span id="ldOut" class="def-val">2.0 ×D</span>
    </div>
    <div class="seg def-seg" id="modes">
      <button data-m="same" type="button">Same cut<span>no derating</span></button>
      <button data-m="2" type="button">m = 2<span>aggressive</span></button>
      <button data-m="3" type="button">m = 3<span>balanced</span></button>
      <button data-m="4" type="button">m = 4<span>finishing</span></button>
    </div>

    <div class="def-main">
      <svg viewBox="0 0 300 430" class="def-svg" role="img" aria-label="A tool clamped in a holder, bending at the tip">
        <rect x="92" y="14" width="116" height="50" rx="4" fill="#B4B2A9"></rect>
        <rect x="120" y="64" width="60" height="34" rx="3" fill="#888780"></rect>
        <text x="150" y="45" text-anchor="middle" fill="#2C2C2A" font-size="12">holder</text>
        <line id="ref" x1="150" y1="98" x2="150" y2="340" stroke="var(--muted)" stroke-dasharray="4 5" stroke-width="1.5"></line>
        <path id="tool" d="" fill="none" stroke="var(--accent)" stroke-width="15" stroke-linecap="round"></path>
        <circle id="tip" cx="150" cy="340" r="7" fill="#e0a93b"></circle>
        <line id="brk" x1="150" y1="356" x2="150" y2="356" stroke-width="2"></line>
        <text id="brkT" x="150" y="376" text-anchor="middle" font-size="12">—</text>
      </svg>
      <div class="def-readout">
        <div class="def-cap-label">Tip deflection vs a stiff 2×D baseline tool</div>
        <div id="multOut" class="def-mult">1.0×</div>
        <div id="cap" class="def-cap"></div>
        <div id="law" class="def-law"></div>
      </div>
    </div>
  </div>`;

const ld = document.getElementById("ld") as HTMLInputElement;
const ldOut = document.getElementById("ldOut")!;
const tool = document.getElementById("tool")!, ref = document.getElementById("ref")!, tip = document.getElementById("tip")!;
const brk = document.getElementById("brk")! as unknown as SVGLineElement, brkT = document.getElementById("brkT")!;
const multOut = document.getElementById("multOut")! as HTMLElement, cap = document.getElementById("cap")!, law = document.getElementById("law")!;
const btns = [...document.querySelectorAll<HTMLButtonElement>("#modes button")];
let mode = "same";

const sev = (m: number) => (m < 2 ? GREEN : m < 5 ? AMBER : RED);
const fmt = (m: number) => (m >= 10 ? Math.round(m) + "×" : m.toFixed(1) + "×");

function draw() {
  const r = parseFloat(ld.value);
  const e = EXP[mode];
  const mult = Math.pow(r / BASE, e);
  const topX = 150, topY = 98, Lpx = 120 + (r - 2) * 26, tipY = topY + Lpx;
  const dx = Math.min(mult * 6, 132), tipX = topX + dx, cy = topY + Lpx * 0.5;
  tool.setAttribute("d", `M ${topX} ${topY} Q ${topX} ${cy} ${tipX} ${tipY}`);
  ref.setAttribute("y2", String(tipY));
  tip.setAttribute("cx", String(tipX)); tip.setAttribute("cy", String(tipY));
  const c = sev(mult);
  brk.setAttribute("x1", String(topX)); brk.setAttribute("x2", String(tipX));
  brk.setAttribute("y1", String(tipY + 16)); brk.setAttribute("y2", String(tipY + 16)); brk.style.stroke = c;
  brkT.setAttribute("x", String((topX + tipX) / 2)); brkT.setAttribute("y", String(tipY + 34));
  brkT.textContent = fmt(mult); (brkT as unknown as SVGTextElement).style.fill = c;
  ldOut.textContent = r.toFixed(1) + " ×D";
  multOut.textContent = fmt(mult); multOut.style.color = c;
  const atBase = Math.abs(r - BASE) < 1e-9;
  cap.textContent = atBase
    ? "This is the baseline — a stiff 2×D tool. Slide right to stick the tool out further."
    : mode === "same"
      ? `Running the short-tool cutting force at ${r.toFixed(1)}×D — the tip deflects ${fmt(mult)} as much as the 2×D baseline, so it chatters, tapers the wall, and can snap.`
      : `The lever model (m = ${mode}) lightens the cut as the tool grows, holding deflection to ${fmt(mult)} vs the 2×D baseline.`;
  law.innerHTML = LAW[mode];
  btns.forEach((b) => b.classList.toggle("on", b.dataset.m === mode));
}

ld.addEventListener("input", draw);
btns.forEach((b) => b.addEventListener("click", () => { mode = b.dataset.m!; if (parseFloat(ld.value) === 2) ld.value = "4"; draw(); }));
draw();
