// Verifies material selection + the expanded role taxonomy flow through generation:
// preset prefix, a non-default role, the uncalibrated-steel flag, and material SFM.
import { describe, it, expect } from "vitest";
import { buildLibrary, defaultSquareFamily, type ToolBlank } from "./library";
import { materialByKey } from "./materials";
import { roleSpec } from "./roles";

const blank: ToolBlank = {
  diameter: 0.25, shank: 0.25, fluteLength: 0.75, overallLength: 2.5, flutes: 3, partNo: "X", coating: "Uncoated",
};

describe("material + role taxonomy", () => {
  it("stainless family: prefix, extra role, calibrate flag, SFM cap", () => {
    const ss = materialByKey("ss");
    const fam = defaultSquareFamily({
      prefix: ss.prefix, sfm: ss.sfm, material: ss.label, calibrated: ss.calibrated,
      roles: [roleSpec("Adaptive_Rough", "square")!, roleSpec("Face_Rough", "square")!],
    });
    const presets = buildLibrary([blank], fam).data[0]["start-values"].presets;
    expect(presets.map((p: any) => p.name)).toEqual(["StainlessSteel_Adaptive_Rough", "StainlessSteel_Face_Rough"]);
    expect(presets.every((p: any) => /calibrate before use/.test(p.description))).toBe(true);
    // 250 SFM on Ø0.25" → ~3820 rpm, well under the 15000 cap (surface-speed driven)
    expect(presets[0].n).toBeLessThan(15000);
    expect(presets[0].n).toBeGreaterThan(3000);
  });

  it("aluminum default family is unaffected (still calibrated, AluWrought)", () => {
    const presets = buildLibrary([blank], defaultSquareFamily()).data[0]["start-values"].presets;
    expect(presets[0].name.startsWith("AluWrought_")).toBe(true);
    expect(presets.some((p: any) => /calibrate before use/.test(p.description))).toBe(false);
  });
});
