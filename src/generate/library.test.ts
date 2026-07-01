// Validates the TS generation engine against the known-good Python output: given the same
// geometry blanks, buildLibrary() must reproduce Manual Builder's Helical_H45AL-3.tools
// (tool count, type, geometry, holders, and every preset's numbers). Pins TS == Python.
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { buildLibrary, buildTool, defaultSquareFamily, type ToolBlank } from "./library";

const fixture = JSON.parse(
  readFileSync(new URL("./__fixtures__/Helical_H45AL-3.tools", import.meta.url), "utf8"),
) as { version: number; data: any[] };

// Reconstruct geometry blanks from the fixture (geometry-only, as ingestion would yield).
const blanks: ToolBlank[] = fixture.data.map((t) => ({
  diameter: t.geometry.DC,
  shank: t.geometry.SFDM,
  fluteLength: t.geometry.LCF,
  overallLength: t.geometry.OAL,
  flutes: t.geometry.NOF,
  partNo: t["product-id"],
  coating: t.grade,
  description: t.description,
}));

const built = buildLibrary(blanks, defaultSquareFamily());
const er = (t: any) => /ER\d+/i.exec(t.holder.description)?.[0];

describe("reduced-neck geometry", () => {
  it("uses reach for LB/shoulder-length and neck Ø for shoulder-diameter", () => {
    const blank: ToolBlank = { diameter: 0.125, shank: 0.125, fluteLength: 0.15625, overallLength: 2.5, flutes: 3, partNo: "46010", coating: "Uncoated", reachIn: 0.5, neckDiameterIn: 0.118 };
    const g = buildTool(blank, defaultSquareFamily(), 1).geometry;
    expect(g.LB).toBeCloseTo(0.5, 9);
    expect(g["shoulder-length"]).toBeCloseTo(0.5, 9);
    expect(g["shoulder-diameter"]).toBeCloseTo(0.118, 9);
  });
  it("straight tool (no reach/neck) is unchanged", () => {
    const blank: ToolBlank = { diameter: 0.25, shank: 0.25, fluteLength: 0.75, overallLength: 2.5, flutes: 3, partNo: "x" };
    const g = buildTool(blank, defaultSquareFamily(), 1).geometry;
    expect(g.LB).toBeCloseTo(Math.min(0.75 + 0.25, 2.5), 9);
    expect(g["shoulder-diameter"]).toBeCloseTo(0.25, 9);
    expect(g["shoulder-length"]).toBeCloseTo(0.75, 9);
  });
});

describe("TS engine reproduces the Python H45AL-3 library", () => {
  it("same version and tool count", () => {
    expect(built.version).toBe(fixture.version);
    expect(built.data.length).toBe(fixture.data.length); // 126 (both coatings)
  });

  it("type, corner radius, tip and holder match for every tool", () => {
    for (let i = 0; i < fixture.data.length; i++) {
      const a = fixture.data[i];
      const b = built.data[i];
      expect(b.type).toBe(a.type);
      expect(b.geometry.RE).toBeCloseTo(a.geometry.RE, 9);
      expect(b.geometry["tip-diameter"]).toBeCloseTo(a.geometry["tip-diameter"], 9);
      expect(b.grade).toBe(a.grade);
      expect(er(b)).toBe(er(a)); // same ER holder by Ø
    }
  });

  it("every preset's numbers match (n, f_z, v_f, stepdown, stepover)", () => {
    let checked = 0;
    for (let i = 0; i < fixture.data.length; i++) {
      const aPresets: any[] = fixture.data[i]["start-values"].presets;
      const bPresets: any[] = built.data[i]["start-values"].presets;
      const bByName = new Map(bPresets.map((p) => [p.name, p]));
      for (const a of aPresets) {
        const b = bByName.get(a.name);
        expect(b, `${fixture.data[i].description} / ${a.name}`).toBeTruthy();
        expect(b.n).toBe(a.n);
        expect(b.f_z).toBeCloseTo(a.f_z, 9);
        expect(b.v_f).toBeCloseTo(a.v_f, 3);
        expect(b.stepdown).toBeCloseTo(a.stepdown, 6);
        expect(!!b["use-stepover"]).toBe(!!a["use-stepover"]);
        if (a["use-stepover"]) expect(b.stepover).toBeCloseTo(a.stepover, 6);
        checked++;
      }
    }
    expect(checked).toBe(630); // 126 tools × 5 roles
  });
});
