# Tool Family Configurator

Turn a cutting-tool vendor's product table into a correct, ready-to-import **Autodesk Fusion
tool library** — with the right collet holders and real, physics-derived cutting parameters
for a whole family of tools at once.

**▶ Live app: https://magicfactorymfg.github.io/tool-family-configurator/**

No install, no sign-in, no data leaves your browser.

## What it does

Drop in a tool family → get a Fusion library out:

1. **Geometry in** — a vendor CSV (cutter Ø, shank, LOC, OAL, flutes, part #, optional reach +
   neck for reduced-neck tools) or an existing Fusion `.json` / `.tools` library.
2. **Holders by size** — a CT40 ER collet chuck is matched to each tool's cutter diameter
   (ER16 ≤ 3/16″ · ER25 < 3/8″ · ER32 ≤ 5/8″ · ER40 > 5/8″).
3. **Cutting parameters** — presets per role (adaptive, traditional, slot, wall/floor finish…),
   with the **Adaptive** role length-derated by each tool's L/D via a deflection **lever model**.
4. **JSON out** — download a `.json` library and import it straight into Fusion.

### Three pages
- **Build Library** — the workflow above.
- **Lever Model** — tune the calibration (anchor, exponent `m`, caps/floors) and see the whole
  family scale by L/D.
- **Deflection** — a plain-English explainer of why longer tools need lighter cuts.

## The model in one line

Within a family, good parameters travel as constant ratios of tool diameter at a matched L/D.
As a tool gets longer it deflects more (with the *cube* of reach), so the cutting force is
eased in a systematic way — the exponent `m` sets how aggressively (2 = protect against
breakage, 3 = balanced, 4 = hold deflection flat for tolerance).

## Honest limits

- **Aluminum only** for now (real Helical Speeds & Feeds). Steel is intentionally hidden until
  it has bench-trusted data.
- Feeds & speeds are **model / mid-range fits, not guarantees** — the app flags which presets
  lean on defaults and suggests a few tools to spot-check. Verify on the machine.
- It sizes a static force budget; it does **not** predict chatter. Long reach still needs a tap
  test / stable-speed check.

## Develop locally

```bash
npm install
npm run dev      # http://localhost:5181
npm test         # pure-model + generation tests (vitest)
npm run build    # production build → dist/
```

The cutting math lives in pure, tested modules (`src/leverModel.ts`, `src/generate/*`); the UI
only reads their results. Pushing to `main` auto-deploys to GitHub Pages.

---

Built for the machining community, not for sale. Vendors are a data *source*, not a format —
pull their numbers, emit Fusion's shapes.
