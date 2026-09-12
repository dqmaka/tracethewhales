import { describe, it, expect } from "vitest";
import { computeSoloConviction } from "./solo-signals";

describe("computeSoloConviction", () => {
  it("scores a fresh buy at (close to) the wallet's own smart score", () => {
    const now = new Date();
    expect(computeSoloConviction(90, now, now)).toBe(90);
  });

  it("decays conviction the longer ago the buy happened", () => {
    const now = new Date();
    const twelveHoursAgo = new Date(now.getTime() - 12 * 3_600_000);
    const fresh = computeSoloConviction(90, now, now);
    const stale = computeSoloConviction(90, twelveHoursAgo, now);
    expect(stale).toBeLessThan(fresh);
  });

  it("never decays below the freshness floor (60% of the wallet score)", () => {
    const now = new Date();
    const wayOutsideWindow = new Date(now.getTime() - 500 * 3_600_000);
    expect(computeSoloConviction(90, wayOutsideWindow, now)).toBe(Math.round(90 * 0.6));
  });

  it("never exceeds 100 even for a perfect wallet score", () => {
    const now = new Date();
    expect(computeSoloConviction(100, now, now)).toBeLessThanOrEqual(100);
  });
});
