import { describe, it, expect } from "vitest";
import { computeExitConviction, type ConvergingSeller } from "./sell-signals";
import { CONVERGENCE_WINDOW_HOURS } from "./signals";

function seller(overrides: Partial<ConvergingSeller> = {}): ConvergingSeller {
  return {
    address: "Wallet1111111111111111111111111111111111",
    label: null,
    score: 80,
    pnl30d: 0,
    amountUsd: 500,
    lastSellAt: new Date(),
    fundingSource: null,
    ...overrides,
  };
}

describe("computeExitConviction", () => {
  it("uses wallet score directly as quality, without re-blending pnl30d a second time", () => {
    // Regression test: Wallet.smartScore already has its own realized-profit
    // component (see scoreProfit in lib/scoring.ts) — pnl30d must not also
    // move conviction on top of that, or profitability ends up double-counted.
    const now = new Date();
    const lowPnl = computeExitConviction(
      [seller({ score: 80, pnl30d: -90, lastSellAt: now }), seller({ score: 80, pnl30d: -90, lastSellAt: now })],
      now
    );
    const highPnl = computeExitConviction(
      [seller({ score: 80, pnl30d: 400, lastSellAt: now }), seller({ score: 80, pnl30d: 400, lastSellAt: now })],
      now
    );
    expect(lowPnl.convictionScore).toBe(highPnl.convictionScore);
  });

  it("gives more confirming sellers a higher score via the +8-per-wallet bonus", () => {
    const now = new Date();
    const two = computeExitConviction([seller({ lastSellAt: now }), seller({ lastSellAt: now })], now);
    const three = computeExitConviction(
      [seller({ lastSellAt: now }), seller({ lastSellAt: now }), seller({ lastSellAt: now })],
      now
    );
    expect(three.convictionScore).toBeGreaterThan(two.convictionScore);
  });

  it("never exceeds 100 even with many high-quality confirming sellers", () => {
    const now = new Date();
    const sellers = Array.from({ length: 10 }, () => seller({ score: 100, pnl30d: 500, lastSellAt: now }));
    const result = computeExitConviction(sellers, now);
    expect(result.convictionScore).toBeLessThanOrEqual(100);
  });

  it("decays score for a sell-off whose last confirming sell is stale, down to the freshness floor", () => {
    const now = new Date();
    const fresh = computeExitConviction([seller({ lastSellAt: now }), seller({ lastSellAt: now })], now);
    const staleSellAt = new Date(now.getTime() - CONVERGENCE_WINDOW_HOURS * 60 * 60 * 1000);
    const stale = computeExitConviction(
      [seller({ lastSellAt: staleSellAt }), seller({ lastSellAt: staleSellAt })],
      now
    );
    expect(stale.convictionScore).toBeLessThan(fresh.convictionScore);
    expect(stale.convictionScore).toBeGreaterThan(0);
  });

  it("uses the most recent of all sellers' lastSellAt, not the first", () => {
    const now = new Date();
    const older = new Date(now.getTime() - 60 * 60_000);
    const result = computeExitConviction([seller({ lastSellAt: older }), seller({ lastSellAt: now })], now);
    expect(result.lastSellAt.getTime()).toBe(now.getTime());
  });

  it("sorts returned sellers by amountUsd descending", () => {
    const now = new Date();
    const result = computeExitConviction(
      [seller({ amountUsd: 100, lastSellAt: now }), seller({ amountUsd: 900, lastSellAt: now })],
      now
    );
    expect(result.sellers[0].amountUsd).toBe(900);
    expect(result.sellers[1].amountUsd).toBe(100);
  });
});
