import { describe, it, expect } from "vitest";
import { computeWalletPerformanceSummary, type WalletOutcomeRow } from "./wallet-performance";

function outcome(overrides: Partial<WalletOutcomeRow> = {}): WalletOutcomeRow {
  return {
    address: "Wallet1111111111111111111111111111111111",
    source: "fomo",
    discoveredAt: new Date(),
    initialScore: 70,
    score7d: null,
    score14d: null,
    score30d: null,
    stillWatched7d: null,
    stillWatched14d: null,
    stillWatched30d: null,
    ...overrides,
  };
}

describe("computeWalletPerformanceSummary", () => {
  it("computes survival rate and average score change for a checkpoint", () => {
    const outcomes = [
      outcome({ initialScore: 70, score7d: 75, stillWatched7d: true }),
      outcome({ initialScore: 70, score7d: 60, stillWatched7d: true }),
      outcome({ initialScore: 70, score7d: 20, stillWatched7d: false }),
    ];
    const summary = computeWalletPerformanceSummary(outcomes);
    expect(summary.overall["7d"].sampleSize).toBe(3);
    expect(summary.overall["7d"].survivalRatePercent).toBeCloseTo(66.7, 1); // 2 of 3 still watched
    expect(summary.overall["7d"].avgScoreChange).toBeCloseTo(-18.3, 1); // (+5 - 10 - 50) / 3
  });

  it("excludes wallets that haven't reached the checkpoint yet", () => {
    const outcomes = [
      outcome({ initialScore: 70, score7d: 75, stillWatched7d: true }),
      outcome({ initialScore: 70, score7d: null, stillWatched7d: null }),
    ];
    const summary = computeWalletPerformanceSummary(outcomes);
    expect(summary.overall["7d"].sampleSize).toBe(1);
  });

  it("does not survivorship-bias the average score change (includes unwatched wallets)", () => {
    // A wallet that got unwatched still has a score reading recorded at the
    // moment it failed — excluding it would make the pipeline look better
    // than it really is.
    const outcomes = [
      outcome({ initialScore: 80, score7d: 10, stillWatched7d: false }),
    ];
    const summary = computeWalletPerformanceSummary(outcomes);
    expect(summary.overall["7d"].sampleSize).toBe(1);
    expect(summary.overall["7d"].avgScoreChange).toBeCloseTo(-70, 1);
  });

  it("returns null stats for a checkpoint with zero samples", () => {
    const summary = computeWalletPerformanceSummary([]);
    expect(summary.overall["7d"].survivalRatePercent).toBeNull();
    expect(summary.overall["7d"].avgScoreChange).toBeNull();
    expect(summary.overall["7d"].sampleSize).toBe(0);
  });

  it("breaks results down by discovery source", () => {
    const outcomes = [
      outcome({ source: "fomo", initialScore: 70, score7d: 90, stillWatched7d: true }),
      outcome({ source: "gainers_losers", initialScore: 70, score7d: 20, stillWatched7d: false }),
    ];
    const summary = computeWalletPerformanceSummary(outcomes);
    const fomo = summary.bySource.find((b) => b.source === "fomo")!;
    const gainersLosers = summary.bySource.find((b) => b.source === "gainers_losers")!;
    expect(fomo.checkpoints["7d"].survivalRatePercent).toBe(100);
    expect(gainersLosers.checkpoints["7d"].survivalRatePercent).toBe(0);
  });

  it("reports the total number of tracked discovery outcomes", () => {
    const summary = computeWalletPerformanceSummary([outcome(), outcome(), outcome()]);
    expect(summary.totalTracked).toBe(3);
  });
});
