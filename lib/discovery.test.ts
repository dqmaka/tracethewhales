import { describe, it, expect } from "vitest";
import {
  detectSniperBotPenalty,
  detectHighFrequencyBotPenalty,
  detectTemplatedSizingPenalty,
  detectFlipBotPenalty,
  detectFreshWalletPenalty,
  detectHighVelocityBotPenalty,
  findFundingSource,
  blendTrustedScore,
  qualifiesByRealPnl,
  TX_HISTORY_LIMIT,
} from "./discovery";
import type { ScorableTransaction } from "./scoring";
import type { HeliusEnhancedTransaction } from "./helius";

function tx(overrides: Partial<ScorableTransaction> = {}): ScorableTransaction {
  return {
    tokenKey: "TokenA",
    amountUsd: 100,
    type: "BUY",
    occurredAt: new Date(),
    ...overrides,
  };
}

function rawTx(overrides: Partial<HeliusEnhancedTransaction> = {}): HeliusEnhancedTransaction {
  return {
    signature: "sig",
    timestamp: Math.floor(Date.now() / 1000),
    type: "SWAP",
    source: "PUMP_FUN",
    fee: 5000,
    feePayer: "Wallet",
    tokenTransfers: [],
    nativeTransfers: [],
    ...overrides,
  };
}

describe("detectSniperBotPenalty", () => {
  it("flags 3+ near-identical tiny buys with zero sells, all from a launchpad", () => {
    const transactions = [tx({ amountUsd: 2 }), tx({ amountUsd: 2 }), tx({ amountUsd: 2 })];
    const rawTxs = [rawTx(), rawTx(), rawTx()];
    expect(detectSniperBotPenalty(rawTxs, transactions)).toBeGreaterThan(0);
  });

  it("does not flag a wallet that has sold at least once", () => {
    const transactions = [tx({ amountUsd: 2 }), tx({ amountUsd: 2 }), tx({ amountUsd: 2, type: "SELL" })];
    const rawTxs = [rawTx(), rawTx(), rawTx()];
    expect(detectSniperBotPenalty(rawTxs, transactions)).toBe(0);
  });

  it("does not flag buys whose average size is too large for a sniper", () => {
    const transactions = [tx({ amountUsd: 50 }), tx({ amountUsd: 50 }), tx({ amountUsd: 50 })];
    const rawTxs = [rawTx(), rawTx(), rawTx()];
    expect(detectSniperBotPenalty(rawTxs, transactions)).toBe(0);
  });

  it("does not flag varied buy sizes even if small and launchpad-sourced", () => {
    const transactions = [tx({ amountUsd: 1 }), tx({ amountUsd: 1 }), tx({ amountUsd: 5 })];
    const rawTxs = [rawTx(), rawTx(), rawTx()];
    expect(detectSniperBotPenalty(rawTxs, transactions)).toBe(0);
  });

  it("does not flag tiny uniform buys routed through general-purpose DEXs, not a launchpad", () => {
    const transactions = [tx({ amountUsd: 2 }), tx({ amountUsd: 2 }), tx({ amountUsd: 2 })];
    const rawTxs = [rawTx({ source: "JUPITER" }), rawTx({ source: "JUPITER" }), rawTx({ source: "JUPITER" })];
    expect(detectSniperBotPenalty(rawTxs, transactions)).toBe(0);
  });
});

describe("detectHighFrequencyBotPenalty", () => {
  it("flags a suspiciously regular, fast trading cadence", () => {
    const now = Date.now();
    const transactions = Array.from({ length: 7 }, (_, i) => tx({ occurredAt: new Date(now + i * 2 * 60_000) }));
    expect(detectHighFrequencyBotPenalty(transactions)).toBeGreaterThan(0);
  });

  it("does not flag irregular (human-like) trade timing", () => {
    const now = Date.now();
    const offsetsMinutes = [0, 1, 15, 16, 40, 41, 90];
    const transactions = offsetsMinutes.map((m) => tx({ occurredAt: new Date(now + m * 60_000) }));
    expect(detectHighFrequencyBotPenalty(transactions)).toBe(0);
  });

  it("does not flag too small a sample to draw a conclusion from", () => {
    const now = Date.now();
    const transactions = Array.from({ length: 5 }, (_, i) => tx({ occurredAt: new Date(now + i * 2 * 60_000) }));
    expect(detectHighFrequencyBotPenalty(transactions)).toBe(0);
  });
});

describe("detectTemplatedSizingPenalty", () => {
  it("flags uniform position sizes at a LARGE size, unlike the sniper check's small-dollar-only gate", () => {
    const transactions = Array.from({ length: 5 }, () => tx({ amountUsd: 2_000 }));
    expect(detectTemplatedSizingPenalty(transactions)).toBeGreaterThan(0);
  });

  it("does not flag varied position sizes", () => {
    const transactions = [
      tx({ amountUsd: 500 }),
      tx({ amountUsd: 2_000 }),
      tx({ amountUsd: 100 }),
      tx({ amountUsd: 3_000 }),
      tx({ amountUsd: 800 }),
    ];
    expect(detectTemplatedSizingPenalty(transactions)).toBe(0);
  });

  it("does not flag a wallet that sells a meaningful share of the time", () => {
    const transactions = [
      ...Array.from({ length: 5 }, () => tx({ amountUsd: 2_000 })),
      tx({ amountUsd: 2_000, type: "SELL" }),
      tx({ amountUsd: 2_000, type: "SELL" }),
    ];
    expect(detectTemplatedSizingPenalty(transactions)).toBe(0);
  });
});

describe("detectFlipBotPenalty", () => {
  it("flags buy-then-instant-sell round trips across several tokens", () => {
    const now = Date.now();
    const transactions: ScorableTransaction[] = [];
    for (let i = 0; i < 3; i++) {
      const token = `Token${i}`;
      transactions.push(tx({ tokenKey: token, type: "BUY", occurredAt: new Date(now) }));
      transactions.push(tx({ tokenKey: token, type: "SELL", occurredAt: new Date(now + 2 * 60_000) }));
    }
    expect(detectFlipBotPenalty(transactions)).toBeGreaterThan(0);
  });

  it("does not flag a wallet that holds positions for a real amount of time", () => {
    const now = Date.now();
    const transactions: ScorableTransaction[] = [];
    for (let i = 0; i < 3; i++) {
      const token = `Token${i}`;
      transactions.push(tx({ tokenKey: token, type: "BUY", occurredAt: new Date(now) }));
      transactions.push(tx({ tokenKey: token, type: "SELL", occurredAt: new Date(now + 60 * 60_000) }));
    }
    expect(detectFlipBotPenalty(transactions)).toBe(0);
  });

  it("does not flag too few completed round trips", () => {
    const now = Date.now();
    const transactions = [
      tx({ tokenKey: "TokenA", type: "BUY", occurredAt: new Date(now) }),
      tx({ tokenKey: "TokenA", type: "SELL", occurredAt: new Date(now + 60_000) }),
    ];
    expect(detectFlipBotPenalty(transactions)).toBe(0);
  });
});

describe("detectFreshWalletPenalty", () => {
  it("regression: does NOT flag an active wallet just because the fetch hit TX_HISTORY_LIMIT", () => {
    // This is the exact bug from the live rescan: Helius returns newest-first
    // capped at TX_HISTORY_LIMIT, so a wallet active enough to fill that
    // window has a "recent" oldest-visible-tx by construction — that's
    // evidence of activity, not of the wallet being new. Wrongly unwatched
    // ~20 legitimate wallets before this guard was added.
    const now = Math.floor(Date.now() / 1000);
    const txs = Array.from({ length: TX_HISTORY_LIMIT }, (_, i) => rawTx({ timestamp: now - i * 60 }));
    expect(detectFreshWalletPenalty(txs)).toBe(0);
  });

  it("flags a wallet whose complete visible history is under a day old and already active", () => {
    const now = Math.floor(Date.now() / 1000);
    // Fewer than TX_HISTORY_LIMIT -> this genuinely is the wallet's full history.
    const txs = Array.from({ length: 15 }, (_, i) => rawTx({ timestamp: now - i * 3600 })); // ~15h span
    expect(detectFreshWalletPenalty(txs)).toBeGreaterThan(0);
  });

  it("does not flag a wallet whose complete visible history is old", () => {
    const now = Math.floor(Date.now() / 1000);
    const txs = Array.from({ length: 15 }, (_, i) => rawTx({ timestamp: now - 30 * 86_400 - i * 3600 }));
    expect(detectFreshWalletPenalty(txs)).toBe(0);
  });

  it("does not flag a wallet with too few actual swaps in its history", () => {
    const now = Math.floor(Date.now() / 1000);
    const txs = Array.from({ length: 5 }, (_, i) => rawTx({ timestamp: now - i * 60 }));
    expect(detectFreshWalletPenalty(txs)).toBe(0);
  });
});

describe("detectHighVelocityBotPenalty", () => {
  it(
    "regression: flags a wallet trading many times per second, which the " +
      "regularity-based HFT/flip-bot checks miss due to whole-second timestamp " +
      "quantization (observed live: HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC, " +
      "50 raw transactions spanning a single second, scored zero on every other check)",
    () => {
      const now = Date.now();
      const transactions = Array.from({ length: 45 }, (_, i) =>
        tx({ occurredAt: new Date(now + Math.floor(i / 45)) })
      );
      expect(detectHighVelocityBotPenalty(transactions)).toBeGreaterThan(0);
    }
  );

  it("does not flag a normal trading pace", () => {
    const now = Date.now();
    const transactions = Array.from({ length: 20 }, (_, i) => tx({ occurredAt: new Date(now + i * 60_000) })); // 1/min
    expect(detectHighVelocityBotPenalty(transactions)).toBe(0);
  });

  it("does not flag too small a sample to draw a conclusion from", () => {
    const now = Date.now();
    const transactions = Array.from({ length: 10 }, (_, i) => tx({ occurredAt: new Date(now + i) }));
    expect(detectHighVelocityBotPenalty(transactions)).toBe(0);
  });
});

describe("findFundingSource", () => {
  it("returns the sender of the oldest visible inbound native SOL transfer", () => {
    const address = "WalletUnderTest11111111111111111111111111";
    // Helius returns newest-first; the function walks from the end.
    const txs = [
      rawTx({ nativeTransfers: [{ fromUserAccount: "Recent", toUserAccount: address, amount: 1_000 }] }),
      rawTx({ nativeTransfers: [{ fromUserAccount: "Oldest", toUserAccount: address, amount: 500 }] }),
    ];
    expect(findFundingSource(address, txs)).toBe("Oldest");
  });

  it("returns null when no inbound transfer to this address is visible", () => {
    const address = "WalletUnderTest11111111111111111111111111";
    const txs = [rawTx({ nativeTransfers: [{ fromUserAccount: address, toUserAccount: "Someone", amount: 500 }] })];
    expect(findFundingSource(address, txs)).toBeNull();
  });
});

describe("blendTrustedScore", () => {
  it("weighs a trusted candidate's own Solana behavior over its external rank (70/30)", () => {
    expect(blendTrustedScore(80, 70)).toBeCloseTo(80 * 0.7 + 70 * 0.3, 5);
  });

  it("no longer lets a high external rank alone float a behaviorally bad wallet to a 70+ score", () => {
    // Regression test: this used to be Math.max(behaviorScore, rankScore),
    // so a wallet with a 1st-place FOMO rank (rankScore ~99) but genuinely
    // terrible Solana behavior (e.g. currently losing money — behaviorScore
    // now carries its own profit component, see scoreProfit in
    // lib/scoring.ts) still qualified outright. It must not anymore.
    const blended = blendTrustedScore(10, 99);
    expect(blended).toBeLessThan(60); // below SMART_SCORE_THRESHOLD
  });

  it("still gives a proven top-ranked trader a meaningful boost over mediocre behavior alone", () => {
    const behaviorOnly = 50;
    const blended = blendTrustedScore(behaviorOnly, 99); // rank 1
    expect(blended).toBeGreaterThan(behaviorOnly);
  });
});

describe("qualifiesByRealPnl", () => {
  it("qualifies a verified, high-PnL wallet with no bot evidence", () => {
    expect(qualifiesByRealPnl(true, 10_000, 0)).toBe(true);
  });

  it(
    "regression: a wallet with strong bot evidence no longer qualifies purely on PnL " +
      "(observed live: an arbitrage bot sub-second-flipping between two paired tokens, " +
      "1000+ trades in 15 minutes, flooding the webhook and exhausting the DB connection " +
      "pool, stayed qualified/tracked because this path never looked at botPenalty at all)",
    () => {
      expect(qualifiesByRealPnl(true, 50_000, 60)).toBe(false);
    }
  );

  it("still allows PnL qualification through mild, single-signal bot evidence", () => {
    expect(qualifiesByRealPnl(true, 10_000, 30)).toBe(true);
  });

  it("never qualifies when the PnL lookup itself wasn't verified", () => {
    expect(qualifiesByRealPnl(false, 10_000, 0)).toBe(false);
  });

  it("never qualifies below the PnL bar even with zero bot evidence", () => {
    expect(qualifiesByRealPnl(true, 100, 0)).toBe(false);
  });
});
