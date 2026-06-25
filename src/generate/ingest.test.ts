// Ingestion tests: .tools round-trip and CSV product-table parsing.
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { frac, parseToolsJson, parseCsv, parseGeometry, nonMillableCount } from "./ingest";

describe("frac()", () => {
  it("parses fractions and mixed numbers", () => {
    expect(frac("1/8")).toBeCloseTo(0.125, 9);
    expect(frac("3/16")).toBeCloseTo(0.1875, 9);
    expect(frac("1-1/2")).toBeCloseTo(1.5, 9);
    expect(frac("1")).toBe(1);
    expect(frac("0.25")).toBe(0.25);
    expect(Number.isNaN(frac(""))).toBe(true);
  });
});

describe("parseToolsJson()", () => {
  const fixture = JSON.parse(
    readFileSync(new URL("./__fixtures__/Helical_H45AL-3.tools", import.meta.url), "utf8"),
  );
  it("recovers every tool's geometry blank", () => {
    const blanks = parseToolsJson(fixture);
    expect(blanks.length).toBe(126);
    const b = blanks[0];
    expect(b.diameter).toBe(fixture.data[0].geometry.DC);
    expect(b.fluteLength).toBe(fixture.data[0].geometry.LCF);
    expect(b.coating).toBe(fixture.data[0].grade);
    expect(b.partNo).toBe(String(fixture.data[0]["product-id"]));
  });
});

describe("parseCsv()", () => {
  // The Helical product-table CSV layout (Zplus column), incl. messy header rows.
  const csv = [
    "Cutter Diameter,Shank Diameter,Length of Cut,Overall Length,Flutes,Zplus Coated,,Tool Description,",
    'D1(h6),D2(h6),"L2","L1",#,Tool #,Price,,header',
    ",,,,,,,,note",
    "1/8,1/8,1/4,1-1/2,3,3017,$26.80 USD,H45AL-S-30125,",
    "1/4,1/4,3/4,2-1/2,3,3167,$46.90 USD,H45AL-R-30250,",
    "1,1,2,5,3,3752,$503.80 USD,H45AL-R-31000,",
  ].join("\n");

  it("parses data rows, skips headers/notes, detects coating", () => {
    const blanks = parseCsv(csv);
    expect(blanks.length).toBe(3);
    expect(blanks[0]).toMatchObject({ diameter: 0.125, shank: 0.125, fluteLength: 0.25, overallLength: 1.5, flutes: 3, partNo: "3017", coating: "Zplus", code: "H45AL-S-30125" });
    expect(blanks[1].diameter).toBeCloseTo(0.25, 9);
    expect(blanks[2].diameter).toBe(1);
    expect(blanks[2].overallLength).toBe(5);
  });

  it("parseGeometry dispatches by extension", () => {
    expect(parseGeometry("table.csv", csv).length).toBe(3);
  });
});

describe("parseToolsJson skips non-millable tools", () => {
  it("drops a probe (no LCF/OAL) that would yield null geometry", () => {
    const lib = {
      version: 36,
      data: [
        { type: "flat end mill", "product-id": "EM1", geometry: { DC: 0.25, SFDM: 0.25, LCF: 0.75, OAL: 2.5, NOF: 3 } },
        { type: "probe", "product-id": "PRB", geometry: { DC: 0.157 } }, // no LCF/OAL → must be skipped
        { type: "holder", description: "CT40 ER25", segments: [] },
      ],
    };
    const blanks = parseToolsJson(lib);
    expect(blanks.length).toBe(1);
    expect(blanks[0].partNo).toBe("EM1");
    expect(nonMillableCount(lib)).toBe(1); // the probe
  });
});
