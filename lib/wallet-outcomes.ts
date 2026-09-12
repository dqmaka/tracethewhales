import { prisma } from "./prisma";

// Checkpoints in days since discovery. Longer horizon than SignalOutcome's
// hours-based ones (1h/6h/24h/48h) since wallet quality is a slower-moving
// question — did this wallet stay good over weeks, not minutes.
const CHECKPOINT_DAYS = [7, 14, 30] as const;
type CheckpointDays = (typeof CHECKPOINT_DAYS)[number];
const SCORE_FIELD: Record<CheckpointDays, "score7d" | "score14d" | "score30d"> = {
  7: "score7d",
  14: "score14d",
  30: "score30d",
};
const WATCHED_FIELD: Record<CheckpointDays, "stillWatched7d" | "stillWatched14d" | "stillWatched30d"> = {
  7: "stillWatched7d",
  14: "stillWatched14d",
  30: "stillWatched30d",
};

export interface WalletOutcomeUpdateResult {
  updated: number;
  completed: number;
}

/**
 * Fills in whichever discovery-outcome checkpoints are now due, straight
 * from our own Wallet table — unlike signal outcomes, this needs no
 * external API call at all (score/isWatched are already kept reasonably
 * fresh by pruning + the rescoring rotation), so there's no time-budget
 * concern processing every pending row every run.
 */
export async function updateWalletDiscoveryOutcomes(): Promise<WalletOutcomeUpdateResult> {
  const pending = await prisma.walletDiscoveryOutcome.findMany({ where: { completedAt: null } });

  let updated = 0;
  let completed = 0;

  for (const outcome of pending) {
    const daysSince = (Date.now() - outcome.discoveredAt.getTime()) / 86_400_000;
    const dueCheckpoints = CHECKPOINT_DAYS.filter((d) => daysSince >= d && outcome[SCORE_FIELD[d]] === null);
    if (dueCheckpoints.length === 0) continue;

    const wallet = await prisma.wallet.findUnique({
      where: { id: outcome.walletId },
      select: { smartScore: true, isWatched: true },
    });
    if (!wallet) continue; // wallets are never hard-deleted, but guard anyway

    const data: Record<string, number | boolean> = {};
    for (const d of dueCheckpoints) {
      data[SCORE_FIELD[d]] = wallet.smartScore;
      data[WATCHED_FIELD[d]] = wallet.isWatched;
    }

    const isNowComplete = outcome.score30d !== null || dueCheckpoints.includes(30);
    await prisma.walletDiscoveryOutcome.update({
      where: { id: outcome.id },
      data: { ...data, ...(isNowComplete ? { completedAt: new Date() } : {}) },
    });

    updated++;
    if (isNowComplete) completed++;
  }

  return { updated, completed };
}
