import { describe, it, expect } from "vitest";
import { calculateSmartScore, type ScorableTransaction } from "./scoring";

function tx(overrides: Partial<ScorableTransaction> = {}): ScorableTransaction {
  return {
    tokenKey: "TokenA",
    amountUsd: 100,
    type: "BUY",
    occurredAt: new Date(),
    ...overrides,
  };
}

describe("calculateSmartScore", () => {
  it("scores an empty history low but not zero (consistency/profit default to neutral 50 with no data)", () => {
    const result = calculateSmartScore({ transactions: [] });
    expect(result.activity).toBe(0);
    expect(result.consistency).toBe(50);
    expect(result.roundTripRate).toBe(0);
    expect(result.diversity).toBe(0);
    expect(result.profit).toBe(50);
    expect(result.score).toBeCloseTo(20, 5); // 50*0.2 (consistency) + 50*0.2 (profit), everything else 0
  });

  it("never returns NaN even when a transaction has an invalid (NaN) timestamp", () => {
    // Regression test: a Helius tx with a missing/invalid timestamp produced
    // Math.pow(0.5, NaN) inside scoreActivity, which poisoned the whole
    // weighted sum into NaN. calculateSmartScore must stay finite regardless.
    const result = calculateSmartScore({
      transactions: [tx({ occurredAt: new Date(NaN) }), tx({ tokenKey: "TokenB", type: "SELL" })],
    });
    expect(Number.isFinite(result.score)).toBe(true);
    expect(Number.isFinite(result.activity)).toBe(true);
  });

  it("gives a 100% round-trip rate when every token bought was also sold", () => {
    const now = new Date();
    const result = calculateSmartScore({
      transactions: [
        tx({ tokenKey: "TokenA", type: "BUY", occurredAt: now }),
        tx({ tokenKey: "TokenA", type: "SELL", occurredAt: now }),
      ],
      now,
    });
    expect(result.roundTripRate).toBe(100);
  });

  it("gives a 0% round-trip rate when nothing bought was ever sold", () => {
    const now = new Date();
    const result = calculateSmartScore({
      transactions: [
        tx({ tokenKey: "TokenA", type: "BUY", occurredAt: now }),
        tx({ tokenKey: "TokenB", type: "BUY", occurredAt: now }),
      ],
      now,
    });
    expect(result.roundTripRate).toBe(0);
  });

  it("caps diversity at 100 once unique tokens reach the ceiling (15)", () => {
    const now = new Date();
    const transactions = Array.from({ length: 20 }, (_, i) => tx({ tokenKey: `Token${i}`, occurredAt: now }));
    const result = calculateSmartScore({ transactions, now });
    expect(result.diversity).toBe(100);
  });

  it("scores identical trade sizes as maximally consistent", () => {
    const now = new Date();
    const transactions = [
      tx({ amountUsd: 50, occurredAt: now }),
      tx({ amountUsd: 50, occurredAt: now }),
      tx({ amountUsd: 50, occurredAt: now }),
    ];
    const result = calculateSmartScore({ transactions, now });
    expect(result.consistency).toBe(100);
  });

  it("scores a profitable round trip above the neutral midpoint", () => {
    const now = new Date();
    const transactions = [
      tx({ type: "BUY", amountUsd: 100, occurredAt: now }),
      tx({ type: "SELL", amountUsd: 150, occurredAt: now }), // +50%
    ];
    const result = calculateSmartScore({ transactions, now });
    expect(result.profit).toBe(75); // 50 + 50*0.5
  });

  it("scores a lossy round trip below the neutral midpoint", () => {
    const now = new Date();
    const transactions = [
      tx({ type: "BUY", amountUsd: 100, occurredAt: now }),
      tx({ type: "SELL", amountUsd: 50, occurredAt: now }), // -50%
    ];
    const result = calculateSmartScore({ transactions, now });
    expect(result.profit).toBe(25); // 50 - 50*0.5
  });

  it("treats a still-open position (bought, nothing sold yet) as neutral, not a loss", () => {
    // Regression test: a naive (sells-buys)/buys ratio would read a
    // buy-only wallet as -100% ("lost everything") even though it might be
    // sitting on a large unrealized gain we simply can't see on-chain.
    // There's no realized profit/loss to judge yet, so this must stay
    // neutral rather than dragging the score down for not having sold.
    const now = new Date();
    const transactions = [
      tx({ type: "BUY", amountUsd: 100, occurredAt: now }),
      tx({ type: "BUY", amountUsd: 200, occurredAt: now }),
    ];
    const result = calculateSmartScore({ transactions, now });
    expect(result.profit).toBe(50);
  });

  it("clamps profit at the extremes instead of letting one huge trade blow past 0-100", () => {
    const now = new Date();
    const bigWin = calculateSmartScore({
      transactions: [
        tx({ type: "BUY", amountUsd: 10, occurredAt: now }),
        tx({ type: "SELL", amountUsd: 1000, occurredAt: now }), // +9,900%
      ],
      now,
    });
    expect(bigWin.profit).toBe(100);

    const bigLoss = calculateSmartScore({
      transactions: [
        tx({ type: "BUY", amountUsd: 1000, occurredAt: now }),
        tx({ type: "SELL", amountUsd: 10, occurredAt: now }), // -99%
      ],
      now,
    });
    expect(bigLoss.profit).toBeCloseTo(0.5, 5); // 50 - 99*0.5 — a real sell (sells>0) can approach but never quite reach the 0 floor, since -100% itself is the "no sells yet" neutral case
  });
});
