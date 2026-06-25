// Tests for the tip-frequency estimate + chatter flagging (trend math, not a simulator).
import { describe, it, expect } from "vitest";
import { tipFrequencyHz, toothPassHz, chatterBand, lobeSpeeds, chatterInfo } from "./chatter";

describe("tipFrequencyHz", () => {
  it("matches the worked example (1/2in @ 2in ~ 4375 Hz)", () => {
    expect(tipFrequencyHz(0.5, 2)).toBeCloseTo(4375, 0);
  });
  it("falls with the SQUARE of stickout: double length -> quarter frequency", () => {
    expect(tipFrequencyHz(0.5, 4)).toBeCloseTo(tipFrequencyHz(0.5, 2) / 4, 6);
  });
  it("rises linearly with diameter", () => {
    expect(tipFrequencyHz(1.0, 2)).toBeCloseTo(tipFrequencyHz(0.5, 2) * 2, 6);
  });
});

describe("chatterBand by L/D", () => {
  it("bands the same axis the lever model derates on", () => {
    expect(chatterBand(2.5)).toBe("stiff");
    expect(chatterBand(4)).toBe("moderate");
    expect(chatterBand(5.5)).toBe("long reach");
    expect(chatterBand(7)).toBe("extreme reach");
  });
});

describe("lobeSpeeds + chatterInfo", () => {
  it("lobe peaks are f1/k expressed as RPM", () => {
    const f1 = 1094, z = 3;
    expect(lobeSpeeds(f1, z, 3)).toEqual([Math.round(60 * f1 / 3), Math.round(60 * f1 / 6), Math.round(60 * f1 / 9)]);
    expect(toothPassHz(lobeSpeeds(f1, z)[0], z)).toBeCloseTo(f1, 0); // top lobe: tooth-pass == f1
  });
  it("stiff/moderate tool: top lobe is unreachable on a 15k spindle (just run it)", () => {
    const info = chatterInfo(0.5, 2, 3, 15000); // L/D 4, f1 ~4375 -> top lobe ~87500 rpm
    expect(info.band).toBe("moderate");
    expect(info.topLobeReachable).toBe(false);
  });
  it("long-reach tool: lobe peaks drop into machine range (speed choice matters)", () => {
    const info = chatterInfo(0.5, 4, 3, 15000); // f1 ~1094, L/D 8
    expect(info.band).toBe("extreme reach");
    expect(info.candidateRpm.length).toBeGreaterThan(0);
    expect(info.candidateRpm.every((r) => r <= 15000)).toBe(true);
  });
});
