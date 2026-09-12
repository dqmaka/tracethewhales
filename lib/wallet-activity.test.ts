import { describe, it, expect, vi } from "vitest";
import type { HeliusEnhancedTransaction } from "./helius";

vi.mock("./dexscreener", () => ({
  getTokenOverview: vi.fn(async () => ({
    priceUsd: 100,
    liquidityUsd: 0,
    marketCapUsd: 0,
    volume24hUsd: 0,
    symbol: "SOL",
    name: "Wrapped SOL",
  })),
}));

const { toScorableTransactions, extractNetWalletTrades } = await import("./wallet-activity");

const WALLET = "WalletAddress1111111111111111111111111111";
const MINT_A = "TokenMintAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function makeTx(overrides: Partial<HeliusEnhancedTransaction> = {}): HeliusEnhancedTransaction {
  return {
    signature: "sig1",
    timestamp: Math.floor(Date.now() / 1000),
    type: "SWAP",
    source: "JUPITER",
    fee: 5000,
    feePayer: WALLET,
    tokenTransfers: [],
    nativeTransfers: [],
    ...overrides,
  };
}

describe("toScorableTransactions", () => {
  it("prices a simple SOL-funded buy via the SOL leg, not the (possibly illiquid) token price", async () => {
    const tx = makeTx({
      nativeTransfers: [{ fromUserAccount: WALLET, toUserAccount: "Pool", amount: 1_000_000_000 }], // 1 SOL
      tokenTransfers: [{ fromUserAccount: "Pool", toUserAccount: WALLET, tokenAmount: 500, mint: MINT_A }],
    });

    const result = await toScorableTransactions(WALLET, [tx]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ tokenKey: MINT_A, type: "BUY", amountUsd: 100 }); // 1 SOL * mocked $100
  });

  it("nets same-mint in/out within one transaction to zero instead of counting a fake round trip", async () => {
    // Regression test: Jupiter sometimes routes a swap through the trader's
    // own wallet mid-route (buy USDC→SOL→USDC back in one tx). Naively that
    // reads as the wallet both receiving and sending the same mint — a
    // "round trip" that never happened; net exposure is ~zero.
    const tx = makeTx({
      tokenTransfers: [
        { fromUserAccount: "Pool1", toUserAccount: WALLET, tokenAmount: 200, mint: MINT_A },
        { fromUserAccount: WALLET, toUserAccount: "Pool2", tokenAmount: 200, mint: MINT_A },
      ],
    });

    const result = await toScorableTransactions(WALLET, [tx]);
    expect(result).toHaveLength(0);
  });

  it("still prices a trade via the SOL leg when the SOL never directly touches the wallet (bundler pattern)", async () => {
    // Regression test: pump.fun buys are routinely executed through a
    // bundler/fee-payer, so the SOL payment shows up between the bundler and
    // the pool, never mentioning the buyer's own wallet address at all.
    const tx = makeTx({
      feePayer: "SomeBundler111111111111111111111111111111",
      nativeTransfers: [
        { fromUserAccount: "SomeBundler111111111111111111111111111111", toUserAccount: "Pool", amount: 2_000_000_000 },
      ],
      tokenTransfers: [{ fromUserAccount: "Pool", toUserAccount: WALLET, tokenAmount: 1000, mint: MINT_A }],
    });

    const result = await toScorableTransactions(WALLET, [tx]);
    expect(result).toHaveLength(1);
    expect(result[0].amountUsd).toBe(200); // 2 SOL * mocked $100
  });

  it("nets partial in/out of the same mint to the correct direction and remaining amount", async () => {
    const tx = makeTx({
      tokenTransfers: [
        { fromUserAccount: "Pool1", toUserAccount: WALLET, tokenAmount: 500, mint: MINT_A },
        { fromUserAccount: WALLET, toUserAccount: "Pool2", tokenAmount: 200, mint: MINT_A },
      ],
    });

    const result = await toScorableTransactions(WALLET, [tx]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("BUY");
    // No SOL leg present -> falls back to pricing the net token amount directly.
    expect(result[0].amountUsd).toBe(300 * 100);
  });

  it("ignores non-SWAP transactions entirely", async () => {
    const tx = makeTx({ type: "TRANSFER" });
    const result = await toScorableTransactions(WALLET, [tx]);
    expect(result).toHaveLength(0);
  });

  it("ignores transactions with an invalid timestamp instead of propagating NaN", async () => {
    const tx = makeTx({
      timestamp: NaN,
      tokenTransfers: [{ fromUserAccount: "Pool", toUserAccount: WALLET, tokenAmount: 500, mint: MINT_A }],
    });
    const result = await toScorableTransactions(WALLET, [tx]);
    expect(result).toHaveLength(0);
  });

  it("drops a routing-dust residual instead of pricing it as a real trade", async () => {
    // Regression test: a multi-hop route rarely nets to *exactly* zero after
    // in/out transfers are summed — a near-zero (but nonzero) residual token
    // amount, priced normally, silently corrupted 30d PnL, the consistency
    // score, and the "unusual movement" alert baseline. Below MIN_MEANINGFUL_TRADE_USD gets dropped entirely.
    const tx = makeTx({
      tokenTransfers: [{ fromUserAccount: "Pool", toUserAccount: WALLET, tokenAmount: 0.00000001, mint: MINT_A }],
    });
    const result = await toScorableTransactions(WALLET, [tx]);
    expect(result).toHaveLength(0); // 0.00000001 * mocked $100 = $0.000000001, well under the floor
  });

  it("keeps a small but genuinely meaningful trade just above the dust floor", async () => {
    const tx = makeTx({
      tokenTransfers: [{ fromUserAccount: "Pool", toUserAccount: WALLET, tokenAmount: 0.001, mint: MINT_A }],
    });
    const result = await toScorableTransactions(WALLET, [tx]);
    expect(result).toHaveLength(1); // 0.001 * mocked $100 = $0.10, comfortably above the floor
  });
});

describe("extractNetWalletTrades", () => {
  it("records a normal trade for a tracked wallet", async () => {
    const tx = makeTx({
      tokenTransfers: [{ fromUserAccount: "Pool", toUserAccount: WALLET, tokenAmount: 500, mint: MINT_A }],
    });
    const result = await extractNetWalletTrades(tx, new Set([WALLET]));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ walletAddress: WALLET, mint: MINT_A, type: "BUY", amountUsd: 500 * 100 });
  });

  it("drops a routing-dust residual instead of storing it as a real trade", async () => {
    const tx = makeTx({
      tokenTransfers: [{ fromUserAccount: "Pool", toUserAccount: WALLET, tokenAmount: 0.00000001, mint: MINT_A }],
    });
    const result = await extractNetWalletTrades(tx, new Set([WALLET]));
    expect(result).toHaveLength(0);
  });

  it("ignores transfers not involving a tracked wallet", async () => {
    const tx = makeTx({
      tokenTransfers: [{ fromUserAccount: "Pool", toUserAccount: "SomeoneElse1111111111111111111111111111111", tokenAmount: 500, mint: MINT_A }],
    });
    const result = await extractNetWalletTrades(tx, new Set([WALLET]));
    expect(result).toHaveLength(0);
  });
});
