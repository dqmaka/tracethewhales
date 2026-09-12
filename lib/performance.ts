import { prisma } from "./prisma";
import { MIN_SIGNAL_LIQUIDITY_USD } from "./signals";

export interface SignalOutcomeRow {
  mint: string;
  symbol: string;
  convictionScore: number;
  pushedAt: Date;
  priceAtPush: number | null;
  liquidityAtPushUsd: number | null;
  priceAtEntry: number | null;
  liquidityAtEntryUsd: number | null;
  price1h: number | null;
  price6h: number | null;
  price24h: number | null;
  price48h: number | null;
  liquidity1h: number | null;
  liquidity6h: number | null;
  liquidity24h: number | null;
  liquidity48h: number | null;
}

// Round-trip cost assumptions layered on top of the raw token-price move, so
// performance numbers reflect what a live trade would actually have netted
// instead of an idealized "bought and sold at the exact tick" price change.
/** Per side (buy + sell) — thin, fast-moving liquidity on brand-new tokens. */
export const SLIPPAGE_PERCENT = 1.5;
/** Round-trip Solana network/priority-fee + DEX swap-fee drag, expressed as a
 * % of position size — no tracked position size exists in this simulation to
 * derive a flat $ figure from instead. */
export const GAS_COST_PERCENT = 0.5;
/** A live trade could never fill at the exact instant a signal fires — this
 * is how long after push we treat the position as actually entered. Mirrored
 * as ENTRY_DELAY_MS in lib/signal-outcomes.ts, which captures priceAtEntry. */
export const ENTRY_DELAY_SECONDS = 90;

export interface CheckpointStats {
  sampleSize: number;
  avgChangePercent: number | null;
  winRatePercent: number | null;
  /** Of the sample with a liquidity reading at this checkpoint, the % still
   * above MIN_SIGNAL_LIQUIDITY_USD — i.e. a price "win" here could actually
   * have been exited, not just a paper gain in a token that's since dried up. */
  stillLiquidPercent: number | null;
}

export type CheckpointKey = "1h" | "6h" | "24h" | "48h";
const CHECKPOINT_KEYS: CheckpointKey[] = ["1h", "6h", "24h", "48h"];
const PRICE_FIELD: Record<CheckpointKey, keyof Pick<SignalOutcomeRow, "price1h" | "price6h" | "price24h" | "price48h">> = {
  "1h": "price1h",
  "6h": "price6h",
  "24h": "price24h",
  "48h": "price48h",
};
const LIQUIDITY_FIELD: Record<
  CheckpointKey,
  keyof Pick<SignalOutcomeRow, "liquidity1h" | "liquidity6h" | "liquidity24h" | "liquidity48h">
> = {
  "1h": "liquidity1h",
  "6h": "liquidity6h",
  "24h": "liquidity24h",
  "48h": "liquidity48h",
};

// Mirrors PUSH_MODERATE_CONVICTION_CEILING (74) from signal-push.ts — the
// whole point of this breakdown is checking whether "high conviction"
// pushes actually outperformed "moderate" ones, so the buckets need to line
// up with the same cutoff used to label pushes in the first place.
const CONVICTION_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "60-74 (moderate)", min: 60, max: 74 },
  { label: "75-89 (strong)", min: 75, max: 89 },
  { label: "90-100 (very strong)", min: 90, max: 100 },
];

/**
 * Net-of-cost % change from a simulated entry to a later price: slippage is
 * paid on both legs (worse fill buying in, worse fill selling out) and gas
 * cost is a further flat haircut on whatever's left. `entry` should be
 * priceAtEntry (90s after push), never priceAtPush — see ENTRY_DELAY_SECONDS.
 */
export function netChangePercent(entry: number | null, exit: number | null): number | null {
  if (entry === null || exit === null || entry <= 0) return null;
  const effectiveEntry = entry * (1 + SLIPPAGE_PERCENT / 100);
  const effectiveExit = exit * (1 - SLIPPAGE_PERCENT / 100);
  const netMultiplier = (effectiveExit / effectiveEntry) * (1 - GAS_COST_PERCENT / 100);
  return Math.round((netMultiplier - 1) * 1000) / 10;
}

function computeCheckpointStats(outcomes: SignalOutcomeRow[], key: CheckpointKey): CheckpointStats {
  const priceField = PRICE_FIELD[key];
  const changes = outcomes
    .map((o) => netChangePercent(o.priceAtEntry, o[priceField]))
    .filter((c): c is number => c !== null);

  const liquidityField = LIQUIDITY_FIELD[key];
  const liquidityReadings = outcomes
    .map((o) => o[liquidityField])
    .filter((l): l is number => l !== null);

  const stillLiquidPercent =
    liquidityReadings.length > 0
      ? Math.round((liquidityReadings.filter((l) => l >= MIN_SIGNAL_LIQUIDITY_USD).length / liquidityReadings.length) * 1000) / 10
      : null;

  if (changes.length === 0) {
    return { sampleSize: 0, avgChangePercent: null, winRatePercent: null, stillLiquidPercent };
  }

  const avgChangePercent = changes.reduce((sum, c) => sum + c, 0) / changes.length;
  const winRatePercent = (changes.filter((c) => c > 0).length / changes.length) * 100;
  return {
    sampleSize: changes.length,
    avgChangePercent: Math.round(avgChangePercent * 10) / 10,
    winRatePercent: Math.round(winRatePercent * 10) / 10,
    stillLiquidPercent,
  };
}

export interface ConvictionBucketStats {
  label: string;
  checkpoints: Record<CheckpointKey, CheckpointStats>;
}

export interface PerformanceSummary {
  totalTracked: number;
  overall: Record<CheckpointKey, CheckpointStats>;
  byConvictionBucket: ConvictionBucketStats[];
}

/**
 * Pure aggregation, deliberately separated from the DB fetch below — this is
 * the actual "did our signals work" math, kept side-effect-free so it's
 * directly testable without touching Prisma.
 */
export function computePerformanceSummary(outcomes: SignalOutcomeRow[]): PerformanceSummary {
  const overall = Object.fromEntries(
    CHECKPOINT_KEYS.map((key) => [key, computeCheckpointStats(outcomes, key)])
  ) as Record<CheckpointKey, CheckpointStats>;

  const byConvictionBucket = CONVICTION_BUCKETS.map(({ label, min, max }) => {
    const inBucket = outcomes.filter((o) => o.convictionScore >= min && o.convictionScore <= max);
    return {
      label,
      checkpoints: Object.fromEntries(
        CHECKPOINT_KEYS.map((key) => [key, computeCheckpointStats(inBucket, key)])
      ) as Record<CheckpointKey, CheckpointStats>,
    };
  });

  return { totalTracked: outcomes.length, overall, byConvictionBucket };
}

export interface RecentOutcome {
  mint: string;
  symbol: string;
  convictionScore: number;
  pushedAt: Date;
  changePercent: Partial<Record<CheckpointKey, number | null>>;
  /** true = liquidity at that checkpoint was verified below the tradeable
   * floor — a price change alongside this is a paper gain, not a real one. */
  wentIlliquid: Partial<Record<CheckpointKey, boolean>>;
}

export async function getPerformanceSummary(
  recentLimit = 20
): Promise<{ summary: PerformanceSummary; recent: RecentOutcome[] }> {
  const outcomes = await prisma.signalOutcome.findMany({ orderBy: { pushedAt: "desc" } });

  const summary = computePerformanceSummary(outcomes);

  const recent: RecentOutcome[] = outcomes.slice(0, recentLimit).map((o) => ({
    mint: o.mint,
    symbol: o.symbol,
    convictionScore: o.convictionScore,
    pushedAt: o.pushedAt,
    changePercent: Object.fromEntries(
      CHECKPOINT_KEYS.map((key) => [key, netChangePercent(o.priceAtEntry, o[PRICE_FIELD[key]])])
    ),
    wentIlliquid: Object.fromEntries(
      CHECKPOINT_KEYS.map((key) => {
        const liquidity = o[LIQUIDITY_FIELD[key]];
        return [key, liquidity !== null && liquidity < MIN_SIGNAL_LIQUIDITY_USD];
      })
    ),
  }));

  return { summary, recent };
}

const SNAPSHOT_LOOKBACK_DAYS = 30;
const OVER_2X_THRESHOLD_PERCENT = 100;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface RecentPerformanceSnapshot {
  sampleSize: number;
  over2xPercent: number | null;
  medianChangePercent: number | null;
}

/**
 * A single homepage-sized "did signals actually work lately" readout: the
 * share that at least doubled (net of cost) and the median outcome, both
 * measured at the 48h checkpoint (the last/most complete reading we track)
 * for signals pushed in the last 30 days. Pure aggregation, same
 * pure/DB-split convention as computePerformanceSummary above.
 */
export function computeRecentPerformanceSnapshot(outcomes: SignalOutcomeRow[]): RecentPerformanceSnapshot {
  const changes = outcomes
    .map((o) => netChangePercent(o.priceAtEntry, o.price48h))
    .filter((c): c is number => c !== null);

  if (changes.length === 0) {
    return { sampleSize: 0, over2xPercent: null, medianChangePercent: null };
  }

  const over2xPercent =
    Math.round((changes.filter((c) => c >= OVER_2X_THRESHOLD_PERCENT).length / changes.length) * 1000) / 10;

  return {
    sampleSize: changes.length,
    over2xPercent,
    medianChangePercent: Math.round(median(changes) * 10) / 10,
  };
}

export async function getRecentPerformanceSnapshot(): Promise<RecentPerformanceSnapshot> {
  const since = new Date(Date.now() - SNAPSHOT_LOOKBACK_DAYS * 86_400_000);
  // price48h not null: only count signals that actually reached the final
  // checkpoint — a still-in-flight signal isn't a "did it 2x" result yet.
  const outcomes = await prisma.signalOutcome.findMany({
    where: { pushedAt: { gte: since }, price48h: { not: null } },
  });
  return computeRecentPerformanceSnapshot(outcomes);
}
