import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { verifyReport } from "./verify";

const fixture = JSON.parse(readFileSync(new URL("./__fixtures__/Helical_H45AL-3.tools", import.meta.url), "utf8"));

describe("verifyReport", () => {
  it("summarizes flags and picks a 3-tool L/D spread", () => {
    const r = verifyReport(fixture);
    expect(r.tools).toBe(126);
    expect(r.presets).toBe(630);
    // adaptive (lever) + floor-finish defaults are present and grouped
    expect(r.flags.some((f) => /Adaptive \(HEM\)/.test(f.label))).toBe(true);
    expect(r.flags.some((f) => /Floor finish/.test(f.label))).toBe(true);
    expect(r.spotCheck.length).toBe(3);
    // spread is ascending L/D
    expect(r.spotCheck[0].ld).toBeLessThanOrEqual(r.spotCheck[2].ld);
  });
});
