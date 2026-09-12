export type ScorableTxType = "BUY" | "SELL";

export interface ScorableTransaction {
  tokenKey: string;
  amountUsd: number;
  type: ScorableTxType;
  occurredAt: Date;
  /** Solana tx signature, when known — lets callers link out (e.g. Solscan). Unused by scoring itself. */
  signature?: string;
}

export interface SmartScoreInput {
  transactions: ScorableTransaction[];
  now?: Date;
}

export interface SmartScoreBreakdown {
  score: number;
  activity: number;
  consistency: number;
  roundTripRate: number;
  diversity: number;
  profit: number;
}

// Adding profit took a flat 20 points off the other four (previously
// .25/.25/.3/.2) rather than treating it as a bonus on top — a wallet that
// trades like a pro but loses money should score meaningfully lower than one
// that trades identically and wins, not just get a separate number bolted on
// that nothing else respects. roundTripRate keeps the single highest weight
// (unchanged in relative terms): realized, not paper, activity is still the
// strongest behavioral tell.
const WEIGHTS = {
  activity: 0.2,
  consistency: 0.2,
  roundTripRate: 0.25,
  diversity: 0.15,
  profit: 0.2,
};

/**
 * Recency-weighted activity: recent trades count more than old ones,
 * normalized against a ceiling so very high-frequency wallets cap out at 100.
 */
function scoreActivity(
  transactions: SmartScoreInput["transactions"],
  now: Date
): number {
  if (transactions.length === 0) return 0;
  const halfLifeDays = 14;
  const weighted = transactions.reduce((sum, tx) => {
    const ageDays = (now.getTime() - tx.occurredAt.getTime()) / 86_400_000;
    return sum + Math.pow(0.5, Math.max(ageDays, 0) / halfLifeDays);
  }, 0);
  const activityCeiling = 20;
  return Math.min(100, (weighted / activityCeiling) * 100);
}

/** Lower relative variance in trade size implies a more deliberate, less erratic trader. */
function scoreConsistency(transactions: SmartScoreInput["transactions"]): number {
  if (transactions.length < 2) return 50;
  const amounts = transactions.map((tx) => tx.amountUsd);
  const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  if (mean === 0) return 50;
  const variance =
    amounts.reduce((sum, a) => sum + (a - mean) ** 2, 0) / amounts.length;
  const coefficientOfVariation = Math.sqrt(variance) / mean;
  return Math.max(0, 100 - coefficientOfVariation * 50);
}

/** Share of tokens where a buy was later followed by a sell, a proxy for realized (not just paper) activity. */
function scoreRoundTripRate(transactions: SmartScoreInput["transactions"]): number {
  const byToken = new Map<string, ScorableTxType[]>();
  for (const tx of transactions) {
    const list = byToken.get(tx.tokenKey) ?? [];
    list.push(tx.type);
    byToken.set(tx.tokenKey, list);
  }
  if (byToken.size === 0) return 0;

  let completed = 0;
  for (const types of byToken.values()) {
    if (types.includes("BUY") && types.includes("SELL")) completed += 1;
  }
  return (completed / byToken.size) * 100;
}

function scoreDiversity(transactions: SmartScoreInput["transactions"]): number {
  const uniqueTokens = new Set(transactions.map((tx) => tx.tokenKey)).size;
  const diversityCeiling = 15;
  return Math.min(100, (uniqueTokens / diversityCeiling) * 100);
}

/**
 * Net (sells - buys) as a % of buys over the same transaction window the
 * rest of the score already looks at — trading like a pro but consistently
 * losing money shouldn't score the same as trading identically and winning.
 * Centered at 50 (break-even) rather than 0, and clamped, so one big winning
 * or losing trade can't alone swing this component to the extreme ends.
 * Requires *both* a buy and a sell in the window — a wallet still holding
 * everything it's bought has no realized profit/loss to judge yet (it could
 * be sitting on a huge unrealized gain we simply can't see on-chain), so
 * that's neutral too, not scored as a loss just for not having sold.
 * roundTripRate already penalizes never-selling separately — this only ever
 * judges the trades that *did* round-trip. Deliberately the whole fetched
 * window, not a strict 30-day cut — same convention every other component
 * here already uses (see scoreActivity/scoreConsistency), distinct from the
 * separately-displayed, calendar-scoped Wallet.pnl30d (see estimatePnl30d in
 * lib/discovery.ts).
 */
function scoreProfit(transactions: SmartScoreInput["transactions"]): number {
  let buys = 0;
  let sells = 0;
  for (const tx of transactions) {
    if (tx.type === "BUY") buys += tx.amountUsd;
    else sells += tx.amountUsd;
  }
  if (buys === 0 || sells === 0) return 50;
  const netPercent = ((sells - buys) / buys) * 100;
  return Math.max(0, Math.min(100, 50 + netPercent * 0.5));
}

export function calculateSmartScore(input: SmartScoreInput): SmartScoreBreakdown {
  const now = input.now ?? new Date();
  const safe = (n: number) => (Number.isFinite(n) ? n : 0);
  const activity = safe(scoreActivity(input.transactions, now));
  const consistency = safe(scoreConsistency(input.transactions));
  const roundTripRate = safe(scoreRoundTripRate(input.transactions));
  const diversity = safe(scoreDiversity(input.transactions));
  const profit = safe(scoreProfit(input.transactions));

  const score =
    activity * WEIGHTS.activity +
    consistency * WEIGHTS.consistency +
    roundTripRate * WEIGHTS.roundTripRate +
    diversity * WEIGHTS.diversity +
    profit * WEIGHTS.profit;

  return {
    score: Math.round(score * 100) / 100,
    activity: Math.round(activity * 100) / 100,
    consistency: Math.round(consistency * 100) / 100,
    roundTripRate: Math.round(roundTripRate * 100) / 100,
    diversity: Math.round(diversity * 100) / 100,
    profit: Math.round(profit * 100) / 100,
  };
}
