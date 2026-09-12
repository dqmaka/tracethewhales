import { prisma } from "./prisma";

export interface WalletOutcomeRow {
  address: string;
  source: string;
  discoveredAt: Date;
  initialScore: number;
  score7d: number | null;
  score14d: number | null;
  score30d: number | null;
  stillWatched7d: boolean | null;
  stillWatched14d: boolean | null;
  stillWatched30d: boolean | null;
}

export type WalletCheckpointKey = "7d" | "14d" | "30d";
const CHECKPOINT_KEYS: WalletCheckpointKey[] = ["7d", "14d", "30d"];
const SCORE_FIELD: Record<WalletCheckpointKey, keyof Pick<WalletOutcomeRow, "score7d" | "score14d" | "score30d">> = {
  "7d": "score7d",
  "14d": "score14d",
  "30d": "score30d",
};
const WATCHED_FIELD: Record<
  WalletCheckpointKey,
  keyof Pick<WalletOutcomeRow, "stillWatched7d" | "stillWatched14d" | "stillWatched30d">
> = {
  "7d": "stillWatched7d",
  "14d": "stillWatched14d",
  "30d": "stillWatched30d",
};

// Human-readable labels for the coarse source buckets recorded at discovery
// time (see the `source` field written in lib/discovery.ts's processCandidate).
export const SOURCE_LABELS: Record<string, string> = {
  fomo: "FOMO Leaderboard",
  gainers_losers: "Gainers/Losers",
  early_buyer: "Early Buyer",
  top_traders: "Top Traders",
};

export interface WalletCheckpointStats {
  /** Wallets that have reached this checkpoint's age, regardless of whether
   * they're still watched — deliberately not survivorship-biased. */
  sampleSize: number;
  survivalRatePercent: number | null;
  avgScoreChange: number | null;
}

function computeCheckpointStats(outcomes: WalletOutcomeRow[], key: WalletCheckpointKey): WalletCheckpointStats {
  const scoreField = SCORE_FIELD[key];
  const watchedField = WATCHED_FIELD[key];
  const reached = outcomes.filter((o) => o[scoreField] !== null);

  if (reached.length === 0) return { sampleSize: 0, survivalRatePercent: null, avgScoreChange: null };

  const survivalRatePercent =
    Math.round((reached.filter((o) => o[watchedField] === true).length / reached.length) * 1000) / 10;

  const scoreChanges = reached.map((o) => o[scoreField]! - o.initialScore);
  const avgScoreChange = Math.round((scoreChanges.reduce((sum, c) => sum + c, 0) / scoreChanges.length) * 10) / 10;

  return { sampleSize: reached.length, survivalRatePercent, avgScoreChange };
}

export interface SourceBreakdownStats {
  source: string;
  checkpoints: Record<WalletCheckpointKey, WalletCheckpointStats>;
}

export interface WalletPerformanceSummary {
  totalTracked: number;
  overall: Record<WalletCheckpointKey, WalletCheckpointStats>;
  bySource: SourceBreakdownStats[];
}

/**
 * Pure aggregation, deliberately separated from the DB fetch below — the
 * actual "does our discovery pipeline produce durable wallets" math, kept
 * side-effect-free so it's directly testable without touching Prisma.
 */
export function computeWalletPerformanceSummary(outcomes: WalletOutcomeRow[]): WalletPerformanceSummary {
  const overall = Object.fromEntries(
    CHECKPOINT_KEYS.map((key) => [key, computeCheckpointStats(outcomes, key)])
  ) as Record<WalletCheckpointKey, WalletCheckpointStats>;

  const sources = [...new Set(outcomes.map((o) => o.source))].sort();
  const bySource = sources.map((source) => {
    const subset = outcomes.filter((o) => o.source === source);
    return {
      source,
      checkpoints: Object.fromEntries(
        CHECKPOINT_KEYS.map((key) => [key, computeCheckpointStats(subset, key)])
      ) as Record<WalletCheckpointKey, WalletCheckpointStats>,
    };
  });

  return { totalTracked: outcomes.length, overall, bySource };
}

export interface RecentWalletOutcome {
  address: string;
  source: string;
  discoveredAt: Date;
  initialScore: number;
  /** Most recent checkpoint reading available yet — null if too new for any checkpoint. */
  latestScore: number | null;
  latestStillWatched: boolean | null;
}

export async function getWalletPerformanceSummary(
  recentLimit = 20
): Promise<{ summary: WalletPerformanceSummary; recent: RecentWalletOutcome[] }> {
  const outcomes = await prisma.walletDiscoveryOutcome.findMany({ orderBy: { discoveredAt: "desc" } });

  const summary = computeWalletPerformanceSummary(outcomes);

  const recent: RecentWalletOutcome[] = outcomes.slice(0, recentLimit).map((o) => ({
    address: o.address,
    source: o.source,
    discoveredAt: o.discoveredAt,
    initialScore: o.initialScore,
    latestScore: o.score30d ?? o.score14d ?? o.score7d ?? null,
    latestStillWatched: o.stillWatched30d ?? o.stillWatched14d ?? o.stillWatched7d ?? null,
  }));

  return { summary, recent };
}
