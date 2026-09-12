import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Wallet } from "@prisma/client";

const alertCreate = vi.fn();
const transactionGroupBy = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    alert: { create: alertCreate },
    transaction: { groupBy: transactionGroupBy },
  },
}));

const { maybeCreateAlert, maybeCreateTokenFlowAlert } = await import("./alerts");

function makeWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    id: "wallet1",
    address: "Wallet1111111111111111111111111111111111",
    label: null,
    tag: null,
    smartScore: 90,
    pnl30d: 0,
    firstSeenAt: new Date(),
    isWatched: true,
    fundingSource: null,
    lastRescoredAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  alertCreate.mockReset();
  transactionGroupBy.mockReset();
});

describe("maybeCreateAlert", () => {
  it("fires NEW_WALLET for a wallet's first-ever transaction, regardless of size", () => {
    const wallet = makeWallet({ smartScore: 10 });
    return maybeCreateAlert(
      wallet,
      "SOME",
      "Mint1111111111111111111111111111111111111",
      { type: "BUY", amountUsd: 5, occurredAt: new Date() },
      { isFirstEverTransaction: true, priorAvgAmountUsd: null }
    ).then(() => {
      expect(alertCreate).toHaveBeenCalledTimes(1);
      expect(alertCreate.mock.calls[0][0].data.kind).toBe("NEW_WALLET");
    });
  });

  it("fires WHALE_BUY only when both the size AND the wallet's score clear their thresholds", async () => {
    const highScoreWallet = makeWallet({ smartScore: 90 });
    await maybeCreateAlert(
      highScoreWallet,
      "SOME",
      "Mint1111111111111111111111111111111111111",
      { type: "BUY", amountUsd: 15_000, occurredAt: new Date() },
      { isFirstEverTransaction: false, priorAvgAmountUsd: null }
    );
    expect(alertCreate.mock.calls[0][0].data.kind).toBe("WHALE_BUY");
  });

  it("does not fire WHALE_BUY for a large buy from a low-score wallet — falls through to LARGE_TRANSACTION", async () => {
    const lowScoreWallet = makeWallet({ smartScore: 40 });
    await maybeCreateAlert(
      lowScoreWallet,
      "SOME",
      "Mint1111111111111111111111111111111111111",
      { type: "BUY", amountUsd: 15_000, occurredAt: new Date() },
      { isFirstEverTransaction: false, priorAvgAmountUsd: null }
    );
    expect(alertCreate.mock.calls[0][0].data.kind).toBe("LARGE_TRANSACTION");
  });

  it("fires UNUSUAL_MOVEMENT when a trade is far above the wallet's own average", async () => {
    const wallet = makeWallet({ smartScore: 40 });
    await maybeCreateAlert(
      wallet,
      "SOME",
      "Mint1111111111111111111111111111111111111",
      { type: "BUY", amountUsd: 500, occurredAt: new Date() },
      { isFirstEverTransaction: false, priorAvgAmountUsd: 100 }
    );
    expect(alertCreate.mock.calls[0][0].data.kind).toBe("UNUSUAL_MOVEMENT");
  });

  it("fires nothing for a small, unremarkable trade", async () => {
    const wallet = makeWallet({ smartScore: 40 });
    await maybeCreateAlert(
      wallet,
      "SOME",
      "Mint1111111111111111111111111111111111111",
      { type: "SELL", amountUsd: 10, occurredAt: new Date() },
      { isFirstEverTransaction: false, priorAvgAmountUsd: 50 }
    );
    expect(alertCreate).not.toHaveBeenCalled();
  });

  it("checks most-specific alert first: a debut trade wins over its own whale-sized amount", async () => {
    const wallet = makeWallet({ smartScore: 95 });
    await maybeCreateAlert(
      wallet,
      "SOME",
      "Mint1111111111111111111111111111111111111",
      { type: "BUY", amountUsd: 50_000, occurredAt: new Date() },
      { isFirstEverTransaction: true, priorAvgAmountUsd: null }
    );
    expect(alertCreate.mock.calls[0][0].data.kind).toBe("NEW_WALLET");
  });
});

describe("maybeCreateTokenFlowAlert", () => {
  it("fires only right when a token's share of total buy volume crosses the threshold", async () => {
    const wallet = makeWallet();
    // After this $600 buy: token total = 600, overall total = 1000 -> share 60% (>= 40% threshold).
    // Before it: token total = 0, overall total = 400 -> share 0% (< 40%). Crossing -> should fire.
    transactionGroupBy.mockResolvedValue([
      { tokenId: "token1", _sum: { amountUsd: 600 } },
      { tokenId: "token2", _sum: { amountUsd: 400 } },
    ]);
    await maybeCreateTokenFlowAlert(wallet, "token1", "SOME", "Mint1111111111111111111111111111111111111", {
      type: "BUY",
      amountUsd: 600,
      occurredAt: new Date(),
    });
    expect(alertCreate).toHaveBeenCalledTimes(1);
    expect(alertCreate.mock.calls[0][0].data.kind).toBe("TOKEN_FLOW_ALERT");
  });

  it("does not re-fire on a later buy that keeps the share above threshold but didn't just cross it", async () => {
    const wallet = makeWallet();
    // Before: token total = 600, overall = 1000 -> share 60% (already above threshold).
    // After adding $100 more: token total = 700, overall = 1100 -> still above, but not a fresh crossing.
    transactionGroupBy.mockResolvedValue([
      { tokenId: "token1", _sum: { amountUsd: 700 } },
      { tokenId: "token2", _sum: { amountUsd: 400 } },
    ]);
    await maybeCreateTokenFlowAlert(wallet, "token1", "SOME", "Mint1111111111111111111111111111111111111", {
      type: "BUY",
      amountUsd: 100,
      occurredAt: new Date(),
    });
    expect(alertCreate).not.toHaveBeenCalled();
  });

  it("ignores SELL trades entirely", async () => {
    const wallet = makeWallet();
    await maybeCreateTokenFlowAlert(wallet, "token1", "SOME", "Mint1111111111111111111111111111111111111", {
      type: "SELL",
      amountUsd: 600,
      occurredAt: new Date(),
    });
    expect(transactionGroupBy).not.toHaveBeenCalled();
    expect(alertCreate).not.toHaveBeenCalled();
  });

  it("does not fire below the minimum total inflow floor even if the share would qualify", async () => {
    const wallet = makeWallet();
    transactionGroupBy.mockResolvedValue([{ tokenId: "token1", _sum: { amountUsd: 500 } }]);
    await maybeCreateTokenFlowAlert(wallet, "token1", "SOME", "Mint1111111111111111111111111111111111111", {
      type: "BUY",
      amountUsd: 500,
      occurredAt: new Date(),
    });
    expect(alertCreate).not.toHaveBeenCalled();
  });
});
