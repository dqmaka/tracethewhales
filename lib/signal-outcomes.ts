import { prisma } from "./prisma";
import { getTokenOverview } from "./dexscreener";
import type { ConvergenceSignal } from "./signals";

// Checkpoints we measure a pushed signal's price against, in hours since
// push. Chosen to span short-term (does it pump right away) through the
// full convergence window (48h) so a "high conviction" score can actually be
// validated against what happened, not just trusted on heuristics.
const CHECKPOINT_HOURS = [1, 6, 24, 48] as const;
type CheckpointHours = (typeof CHECKPOINT_HOURS)[number];
const PRICE_FIELD: Record<CheckpointHours, "price1h" | "price6h" | "price24h" | "price48h"> = {
  1: "price1h",
  6: "price6h",
  24: "price24h",
  48: "price48h",
};
const LIQUIDITY_FIELD: Record<CheckpointHours, "liquidity1h" | "liquidity6h" | "liquidity24h" | "liquidity48h"> = {
  1: "liquidity1h",
  6: "liquidity6h",
  24: "liquidity24h",
  48: "liquidity48h",
};
// Runs inside the same 30s-budget push-signals cron — bounds worst case so a
// large backlog of pending outcomes (or a run of slow DexScreener calls)
// can't blow that budget. Any left over just gets picked up next run.
const MAX_OUTCOME_CHECKS_PER_RUN = 20;

// A live trade could never fill at the exact instant a signal fires — this is
// how long after push we treat the position as actually entered. Matches
// ENTRY_DELAY_SECONDS in lib/performance.ts (kept as a separate literal since
// that's the pure-math module and shouldn't import DB-timing constants from
// here, nor vice versa).
const ENTRY_DELAY_MS = 90_000;

/** Called right after a signal is successfully pushed — captures the entry
 * price/liquidity this outcome record will be measured against. */
export async function recordSignalPush(signal: ConvergenceSignal): Promise<void> {
  await prisma.signalOutcome.create({
    data: {
      mint: signal.mint,
      symbol: signal.symbol,
      convictionScore: signal.convictionScore,
      priceAtPush: signal.priceNow,
      liquidityAtPushUsd: signal.liquidityUsd,
    },
  });
}

/**
 * Fills in whichever checkpoints are now due for any not-yet-complete
 * outcome row. Tolerant of the cron running at any cadence — if a checkpoint
 * was missed for a while, it still gets filled with the current price on the
 * next run rather than lost, so nothing depends on a precise schedule.
 */
export async function updateSignalOutcomes(): Promise<{ updated: number; completed: number }> {
  const pending = await prisma.signalOutcome.findMany({
    where: { completedAt: null },
    orderBy: { pushedAt: "asc" }, // oldest first — those are the ones most likely to actually have a checkpoint due
    take: MAX_OUTCOME_CHECKS_PER_RUN,
  });

  let updated = 0;
  let completed = 0;

  for (const outcome of pending) {
    const msSincePush = Date.now() - outcome.pushedAt.getTime();
    const entryDue = outcome.priceAtEntry === null && msSincePush >= ENTRY_DELAY_MS;
    const hoursSincePush = msSincePush / 3_600_000;
    const dueCheckpoints = CHECKPOINT_HOURS.filter((h) => {
      return hoursSincePush >= h && outcome[PRICE_FIELD[h]] === null;
    });
    if (!entryDue && dueCheckpoints.length === 0) continue;

    let overview: { priceUsd: number; liquidityUsd: number } | null = null;
    try {
      overview = await getTokenOverview(outcome.mint);
    } catch (err) {
      console.warn(`Outcome price lookup failed for ${outcome.symbol} (${outcome.mint}):`, (err as Error).message);
      continue;
    }

    // Same DexScreener call already gives us liquidity — capturing it
    // alongside price is free and is what lets a "price gain" be checked
    // against whether the token could actually still be exited then.
    const data: Record<string, number> = {};
    if (entryDue) {
      data.priceAtEntry = overview.priceUsd;
      data.liquidityAtEntryUsd = overview.liquidityUsd;
    }
    for (const h of dueCheckpoints) {
      data[PRICE_FIELD[h]] = overview.priceUsd;
      data[LIQUIDITY_FIELD[h]] = overview.liquidityUsd;
    }

    const isNowComplete = outcome.price48h !== null || dueCheckpoints.includes(48);
    await prisma.signalOutcome.update({
      where: { id: outcome.id },
      data: { ...data, ...(isNowComplete ? { completedAt: new Date() } : {}) },
    });

    updated++;
    if (isNowComplete) completed++;
  }

  return { updated, completed };
}
