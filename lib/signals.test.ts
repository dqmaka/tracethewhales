import { describe, it, expect } from "vitest";
import { computeConviction, CONVERGENCE_WINDOW_HOURS, type ConvergingWallet } from "./signals";

function wallet(overrides: Partial<ConvergingWallet> = {}): ConvergingWallet {
  return {
    address: "Wallet1111111111111111111111111111111111",
    label: null,
    score: 80,
    pnl30d: 0,
    amountUsd: 500,
    lastBuyAt: new Date(),
    fundingSource: null,
    ...overrides,
  };
}

describe("computeConviction", () => {
  it("uses wallet score directly as quality, without re-blending pnl30d a second time", () => {
    // Regression test: Wallet.smartScore already has its own realized-profit
    // component (see scoreProfit in lib/scoring.ts) — pnl30d must not also
    // move conviction on top of that, or profitability ends up double-counted.
    const now = new Date();
    const lowPnl = computeConviction(
      [wallet({ score: 80, pnl30d: -90, lastBuyAt: now }), wallet({ score: 80, pnl30d: -90, lastBuyAt: now })],
      now
    );
    const highPnl = computeConviction(
      [wallet({ score: 80, pnl30d: 400, lastBuyAt: now }), wallet({ score: 80, pnl30d: 400, lastBuyAt: now })],
      now
    );
    expect(lowPnl.convictionScore).toBe(highPnl.convictionScore);
  });

  it("gives more confirming wallets a higher score via the +8-per-wallet bonus", () => {
    const now = new Date();
    const two = computeConviction(
      [wallet({ lastBuyAt: now }), wallet({ lastBuyAt: now })],
      now
    );
    const three = computeConviction(
      [wallet({ lastBuyAt: now }), wallet({ lastBuyAt: now }), wallet({ lastBuyAt: now })],
      now
    );
    expect(three.convictionScore).toBeGreaterThan(two.convictionScore);
  });

  it("never exceeds 100 even with many high-quality confirming wallets", () => {
    const now = new Date();
    const wallets = Array.from({ length: 10 }, () => wallet({ score: 100, pnl30d: 500, lastBuyAt: now }));
    const result = computeConviction(wallets, now);
    expect(result.convictionScore).toBeLessThanOrEqual(100);
  });

  it("decays score for a signal whose last confirming buy is stale, down to the freshness floor", () => {
    const now = new Date();
    const fresh = computeConviction(
      [wallet({ lastBuyAt: now }), wallet({ lastBuyAt: now })],
      now
    );
    const staleBuyAt = new Date(now.getTime() - CONVERGENCE_WINDOW_HOURS * 60 * 60 * 1000);
    const stale = computeConviction(
      [wallet({ lastBuyAt: staleBuyAt }), wallet({ lastBuyAt: staleBuyAt })],
      now
    );
    expect(stale.convictionScore).toBeLessThan(fresh.convictionScore);
    // Freshness floor is 0.6 -> stale score should be roughly 60% of fresh's base, not zeroed out.
    expect(stale.convictionScore).toBeGreaterThan(0);
  });

  it("uses the most recent of all wallets' lastBuyAt, not the first", () => {
    const now = new Date();
    const older = new Date(now.getTime() - 60 * 60_000);
    const result = computeConviction([wallet({ lastBuyAt: older }), wallet({ lastBuyAt: now })], now);
    expect(result.lastBuyAt.getTime()).toBe(now.getTime());
  });

  it("sorts returned wallets by amountUsd descending", () => {
    const now = new Date();
    const result = computeConviction(
      [wallet({ amountUsd: 100, lastBuyAt: now }), wallet({ amountUsd: 900, lastBuyAt: now })],
      now
    );
    expect(result.wallets[0].amountUsd).toBe(900);
    expect(result.wallets[1].amountUsd).toBe(100);
  });
});
