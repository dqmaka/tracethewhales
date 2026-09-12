import { describe, it, expect } from "vitest";
import {
  computePerformanceSummary,
  computeRecentPerformanceSnapshot,
  netChangePercent,
  type SignalOutcomeRow,
} from "./performance";

function outcome(overrides: Partial<SignalOutcomeRow> = {}): SignalOutcomeRow {
  return {
    mint: "Mint1111111111111111111111111111111111111",
    symbol: "TOK",
    convictionScore: 80,
    pushedAt: new Date(),
    priceAtPush: 1,
    liquidityAtPushUsd: 100_000,
    priceAtEntry: null,
    liquidityAtEntryUsd: null,
    price1h: null,
    price6h: null,
    price24h: null,
    price48h: null,
    liquidity1h: null,
    liquidity6h: null,
    liquidity24h: null,
    liquidity48h: null,
    ...overrides,
  };
}

describe("netChangePercent", () => {
  it("applies slippage on both legs plus a gas haircut, not just the raw price move", () => {
    // Raw +50% (1 -> 1.5), but paying 1.5% slippage buying in, 1.5% selling
    // out, and a 0.5% gas drag on what's left eats a real chunk of that.
    expect(netChangePercent(1, 1.5)).toBeCloseTo(44.8, 1);
  });

  it("makes a loss slightly worse once costs are included", () => {
    expect(netChangePercent(1, 0.5)).toBeCloseTo(-51.7, 1);
  });

  it("shows a flat price move as a net loss — costs alone are enough to lose money", () => {
    expect(netChangePercent(100, 100)).toBeCloseTo(-3.4, 1);
  });

  it("scales proportionally regardless of the actual price magnitude", () => {
    expect(netChangePercent(2, 2.2)).toBeCloseTo(6.2, 1);
    expect(netChangePercent(1, 1.05)).toBeCloseTo(1.4, 1);
    expect(netChangePercent(100, 105)).toBeCloseTo(1.4, 1);
  });

  it("returns null instead of dividing by a missing or non-positive entry price", () => {
    expect(netChangePercent(null, 5)).toBeNull();
    expect(netChangePercent(1, null)).toBeNull();
    expect(netChangePercent(0, 5)).toBeNull();
    expect(netChangePercent(-1, 5)).toBeNull();
  });
});

describe("computePerformanceSummary", () => {
  it("computes average % change and win rate for a checkpoint, net of slippage/gas", () => {
    const outcomes = [
      outcome({ priceAtEntry: 1, price24h: 1.5 }), // net ~+44.8%
      outcome({ priceAtEntry: 1, price24h: 0.5 }), // net ~-51.7%
      outcome({ priceAtEntry: 2, price24h: 2.2 }), // net ~+6.2%
    ];
    const summary = computePerformanceSummary(outcomes);
    expect(summary.overall["24h"].sampleSize).toBe(3);
    expect(summary.overall["24h"].avgChangePercent).toBeCloseTo(-0.2, 1); // (44.8-51.7+6.2)/3
    expect(summary.overall["24h"].winRatePercent).toBeCloseTo(66.7, 1); // 2 of 3 still net positive
  });

  it("excludes outcomes where the checkpoint hasn't been reached yet", () => {
    const outcomes = [outcome({ priceAtEntry: 1, price24h: 1.5 }), outcome({ priceAtEntry: 1, price24h: null })];
    const summary = computePerformanceSummary(outcomes);
    expect(summary.overall["24h"].sampleSize).toBe(1);
  });

  it("returns null stats (not NaN/0) for a checkpoint with zero samples", () => {
    const summary = computePerformanceSummary([]);
    expect(summary.overall["1h"].avgChangePercent).toBeNull();
    expect(summary.overall["1h"].winRatePercent).toBeNull();
    expect(summary.overall["1h"].sampleSize).toBe(0);
  });

  it("never divides by a missing or zero entry price", () => {
    const outcomes = [outcome({ priceAtEntry: null, price24h: 5 }), outcome({ priceAtEntry: 0, price24h: 5 })];
    const summary = computePerformanceSummary(outcomes);
    expect(summary.overall["24h"].sampleSize).toBe(0);
  });

  it("excludes an outcome that hasn't reached its simulated entry point yet, even with a checkpoint price already in", () => {
    // priceAtEntry is only filled in ~90s after push — a signal whose 24h
    // checkpoint fired first (cron ordering, not expected but not impossible)
    // still can't be scored until there's an entry price to measure from.
    const outcomes = [outcome({ priceAtEntry: null, price24h: 1.5 })];
    const summary = computePerformanceSummary(outcomes);
    expect(summary.overall["24h"].sampleSize).toBe(0);
  });

  it("breaks results down by conviction bucket so high-conviction pushes can be checked against moderate ones", () => {
    const outcomes = [
      outcome({ convictionScore: 65, priceAtEntry: 1, price24h: 1.05 }), // moderate, net ~+1.4%
      outcome({ convictionScore: 95, priceAtEntry: 1, price24h: 1.5 }), // very strong, net ~+44.8%
    ];
    const summary = computePerformanceSummary(outcomes);
    const moderate = summary.byConvictionBucket.find((b) => b.label.startsWith("60-74"))!;
    const veryStrong = summary.byConvictionBucket.find((b) => b.label.startsWith("90-100"))!;
    expect(moderate.checkpoints["24h"].avgChangePercent).toBeCloseTo(1.4, 1);
    expect(veryStrong.checkpoints["24h"].avgChangePercent).toBeCloseTo(44.8, 1);
  });

  it("reports the total number of tracked outcomes regardless of checkpoint completeness", () => {
    const summary = computePerformanceSummary([outcome(), outcome(), outcome()]);
    expect(summary.totalTracked).toBe(3);
  });

  it("flags a checkpoint where liquidity has since dropped below the tradeable floor (MIN_SIGNAL_LIQUIDITY_USD)", () => {
    // A big price "gain" whose liquidity dried up isn't a gain anyone could
    // actually have exited — this is the whole point of tracking liquidity
    // per checkpoint alongside price.
    const outcomes = [
      outcome({ priceAtEntry: 1, price24h: 5, liquidity24h: 2_000 }), // huge on paper, but illiquid
      outcome({ priceAtEntry: 1, price24h: 1.1, liquidity24h: 80_000 }), // modest but still tradeable
    ];
    const summary = computePerformanceSummary(outcomes);
    expect(summary.overall["24h"].stillLiquidPercent).toBeCloseTo(50, 1);
  });

  it("returns a null stillLiquidPercent when no liquidity readings exist yet for that checkpoint", () => {
    const summary = computePerformanceSummary([outcome({ priceAtEntry: 1, price1h: 1.1, liquidity1h: null })]);
    expect(summary.overall["1h"].stillLiquidPercent).toBeNull();
  });
});

describe("computeRecentPerformanceSnapshot", () => {
  it("computes the share of signals that net-doubled and the median net performance", () => {
    const outcomes = [
      outcome({ priceAtEntry: 1, price48h: 3 }), // net ~+189.7% — over 2x
      outcome({ priceAtEntry: 1, price48h: 2.5 }), // net ~+141.4% — over 2x
      outcome({ priceAtEntry: 1, price48h: 1.05 }), // net ~+1.4%
      outcome({ priceAtEntry: 1, price48h: 1 }), // net ~-3.4% (flat price, cost alone is a loss)
      outcome({ priceAtEntry: 1, price48h: 0.5 }), // net ~-51.7%
    ];
    const snapshot = computeRecentPerformanceSnapshot(outcomes);
    expect(snapshot.sampleSize).toBe(5);
    expect(snapshot.over2xPercent).toBeCloseTo(40, 1); // 2 of 5
    expect(snapshot.medianChangePercent).toBeCloseTo(1.4, 1); // middle of the sorted 5
  });

  it("shows that a raw 2x doesn't actually clear the 2x bar net of cost", () => {
    const outcomes = [outcome({ priceAtEntry: 1, price48h: 2 })]; // raw +100%, net ~+93.1%
    const snapshot = computeRecentPerformanceSnapshot(outcomes);
    expect(snapshot.over2xPercent).toBe(0);
  });

  it("excludes signals that haven't reached the 48h checkpoint yet", () => {
    const outcomes = [outcome({ priceAtEntry: 1, price48h: 1.5 }), outcome({ priceAtEntry: 1, price48h: null })];
    const snapshot = computeRecentPerformanceSnapshot(outcomes);
    expect(snapshot.sampleSize).toBe(1);
  });

  it("returns nulls (not NaN/0) when there's no data yet", () => {
    const snapshot = computeRecentPerformanceSnapshot([]);
    expect(snapshot.sampleSize).toBe(0);
    expect(snapshot.over2xPercent).toBeNull();
    expect(snapshot.medianChangePercent).toBeNull();
  });
});
