import { prisma } from "./prisma";
import type { Wallet } from "@prisma/client";

// A large, high-conviction buy from an already-proven wallet.
const WHALE_BUY_USD_THRESHOLD = 10_000;
const WHALE_BUY_MIN_SCORE = 80;
// A trade well outside the wallet's own normal size — needs a few prior
// trades on record before "normal" means anything.
const UNUSUAL_MOVEMENT_MULTIPLIER = 3;
export const UNUSUAL_MOVEMENT_MIN_SAMPLE = 3;
// Anything smaller still worth surfacing, but not calling out as important.
const LARGE_TRANSACTION_USD_THRESHOLD = 2_000;
// One token pulling in an outsized share of all tracked wallets' buying.
const TOKEN_FLOW_ALERT_SHARE_THRESHOLD = 0.4;
const TOKEN_FLOW_ALERT_MIN_TOTAL_INFLOW_USD = 1_000;
// "Inflow share" is meant to reflect *recent* flow, not all-time — without a
// window this groupBy summed every BUY ever recorded, growing without bound
// as the Transaction table grows, and re-ran that full-table aggregation on
// every single trade (this function fires per-trade, from the webhook path).
// Live-observed: a single hyperactive wallet doing 1000+ trades in 20 minutes
// made this the dominant load on the DB connection pool. 24h matches the
// volume24hUsd window everything else compares "flow" against.
const TOKEN_FLOW_ALERT_WINDOW_HOURS = 24;

export interface AlertableTrade {
  type: "BUY" | "SELL";
  amountUsd: number;
  occurredAt: Date;
}

export interface AlertContext {
  isFirstEverTransaction: boolean;
  /** This wallet's average trade size before this one — null with too few prior trades to mean anything. */
  priorAvgAmountUsd: number | null;
}

/**
 * `occurredAt` (not "now") backs the Alert's createdAt so a backfilled
 * historical trade shows its real age in the Live Alerts feed instead of
 * looking like it just happened. Fires at most one alert per trade — first
 * match wins, most-specific first: a debut matters more than its size, a
 * proven wallet's whale buy more than a generic size anomaly.
 */
export async function maybeCreateAlert(
  wallet: Wallet,
  tokenSymbol: string,
  tokenMint: string,
  trade: AlertableTrade,
  context: AlertContext
) {
  if (context.isFirstEverTransaction) {
    await prisma.alert.create({
      data: {
        kind: "NEW_WALLET",
        walletAddr: wallet.address,
        tokenSymbol,
        tokenMint,
        amountUsd: trade.amountUsd,
        note: "first activity",
        important: false,
        createdAt: trade.occurredAt,
      },
    });
    return;
  }

  if (trade.type === "BUY" && trade.amountUsd >= WHALE_BUY_USD_THRESHOLD && wallet.smartScore >= WHALE_BUY_MIN_SCORE) {
    await prisma.alert.create({
      data: {
        kind: "WHALE_BUY",
        walletAddr: wallet.address,
        tokenSymbol,
        tokenMint,
        amountUsd: trade.amountUsd,
        important: true,
        createdAt: trade.occurredAt,
      },
    });
    return;
  }

  if (
    context.priorAvgAmountUsd !== null &&
    context.priorAvgAmountUsd > 0 &&
    trade.amountUsd >= context.priorAvgAmountUsd * UNUSUAL_MOVEMENT_MULTIPLIER
  ) {
    const multiple = Math.round(trade.amountUsd / context.priorAvgAmountUsd);
    await prisma.alert.create({
      data: {
        kind: "UNUSUAL_MOVEMENT",
        walletAddr: wallet.address,
        tokenSymbol,
        tokenMint,
        amountUsd: trade.amountUsd,
        note: `${multiple}x above own average`,
        important: false,
        createdAt: trade.occurredAt,
      },
    });
    return;
  }

  if (trade.amountUsd >= LARGE_TRANSACTION_USD_THRESHOLD) {
    await prisma.alert.create({
      data: {
        kind: "LARGE_TRANSACTION",
        walletAddr: wallet.address,
        tokenSymbol,
        tokenMint,
        amountUsd: trade.amountUsd,
        important: false,
        createdAt: trade.occurredAt,
      },
    });
  }
}

/**
 * Fires when this one BUY pushes a token's share of *all* tracked wallets'
 * total buy volume across the threshold — i.e. only right at the crossing,
 * not on every subsequent buy that keeps it there. Needs the trade already
 * inserted (so it's counted on the "after" side of the comparison).
 */
export async function maybeCreateTokenFlowAlert(
  wallet: Wallet,
  tokenId: string,
  tokenSymbol: string,
  tokenMint: string,
  trade: AlertableTrade
) {
  if (trade.type !== "BUY") return;

  const cutoff = new Date(Date.now() - TOKEN_FLOW_ALERT_WINDOW_HOURS * 3_600_000);
  const byToken = await prisma.transaction.groupBy({
    by: ["tokenId"],
    where: { type: "BUY", wallet: { isWatched: true }, occurredAt: { gte: cutoff } },
    _sum: { amountUsd: true },
  });

  const totalAfter = byToken.reduce((sum, t) => sum + (t._sum.amountUsd ?? 0), 0);
  if (totalAfter < TOKEN_FLOW_ALERT_MIN_TOTAL_INFLOW_USD) return;

  const tokenAfter = byToken.find((t) => t.tokenId === tokenId)?._sum.amountUsd ?? 0;
  const shareAfter = tokenAfter / totalAfter;

  const totalBefore = totalAfter - trade.amountUsd;
  const tokenBefore = tokenAfter - trade.amountUsd;
  const shareBefore = totalBefore > 0 ? tokenBefore / totalBefore : 0;

  if (shareBefore < TOKEN_FLOW_ALERT_SHARE_THRESHOLD && shareAfter >= TOKEN_FLOW_ALERT_SHARE_THRESHOLD) {
    await prisma.alert.create({
      data: {
        kind: "TOKEN_FLOW_ALERT",
        walletAddr: wallet.address,
        tokenSymbol,
        tokenMint,
        amountUsd: tokenAfter,
        note: `${Math.round(shareAfter * 100)}% of smart money inflow`,
        important: true,
        createdAt: trade.occurredAt,
      },
    });
  }
}
