import { prisma } from "./prisma";
import { refreshWalletFromChain } from "./discovery";
import { getCachedConvergenceSignals } from "./signals";
import { getCachedSellConvergenceSignals } from "./sell-signals";

// Runs inside the same cron as candidate discovery, which is already
// tightly tuned against cron-job.org's 30s external timeout (see
// DISCOVERY_TIME_BUDGET_MS in discovery.ts) — and the candidate loop's own
// budget is only checked *between* batches, so a busy run can already come
// close to that ceiling before this ever starts (observed live: 28.7s for a
// heavier-than-usual run). The caller (the cron route) is expected to pass
// only whatever time is actually left, capped at this default — this step
// must never assume it gets a full window of its own.
const RESCORE_BATCH_SIZE = 5;
const DEFAULT_RESCORE_TIME_BUDGET_MS = 5_000;
const RESCORE_PER_WALLET_TIMEOUT_MS = 3_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

export interface RescoreResult {
  attempted: number;
  unwatched: string[];
}

/**
 * Extracted as its own pure function specifically so this decision has a
 * regression test: a "doesn't qualify" verdict must only ever unwatch a
 * wallet when the PnL check was actually verified. Getting this backwards
 * (as the first live run of this feature briefly did, while Birdeye's quota
 * happened to be exhausted) mass-unwatches good wallets on nothing but an
 * external API's downtime.
 */
export function shouldStayWatched(qualifies: boolean, pnlVerified: boolean): boolean {
  return qualifies || !pnlVerified;
}

export interface RescoreCandidate {
  address: string;
  lastRescoredAt: Date | null;
}

/**
 * Orders watched-wallet candidates so ones currently participating in a live
 * (cached) signal get rescored first — their data directly feeds today's
 * conviction scores, so keeping it fresh matters more right now than a
 * wallet sitting quietly outside any signal. Falls back to the existing
 * oldest-rescored-first order within (and after) that priority group, so
 * every watched wallet still eventually cycles through regardless. Pure and
 * generic over the candidate shape so this has a direct regression test,
 * independent of Prisma — callers can pass full Wallet rows straight through.
 */
export function selectRescoreBatch<T extends RescoreCandidate>(
  candidates: T[],
  priorityAddresses: Set<string>,
  batchSize: number
): T[] {
  const byOldestFirst = (a: T, b: T) =>
    (a.lastRescoredAt?.getTime() ?? -Infinity) - (b.lastRescoredAt?.getTime() ?? -Infinity);

  const priority = candidates.filter((c) => priorityAddresses.has(c.address)).sort(byOldestFirst);
  const rest = candidates.filter((c) => !priorityAddresses.has(c.address)).sort(byOldestFirst);

  return [...priority, ...rest].slice(0, batchSize);
}

/**
 * Wallets currently listed as a confirming buyer or seller in the cached
 * (already-computed) buy/sell signal lists — reading the cache instead of
 * recomputing convergence groups from scratch keeps this cheap (two indexed
 * single-row reads, no Birdeye/DexScreener calls).
 */
async function getActiveSignalWalletAddresses(): Promise<Set<string>> {
  const [buySignals, sellSignals] = await Promise.all([
    getCachedConvergenceSignals(20),
    getCachedSellConvergenceSignals(20),
  ]);
  const addresses = new Set<string>();
  for (const s of buySignals) for (const w of s.wallets) addresses.add(w.address);
  for (const s of sellSignals) for (const w of s.sellers) addresses.add(w.address);
  return addresses;
}

/**
 * Re-validates already-tracked wallets against their *current* on-chain
 * behavior instead of trusting whatever score they qualified with once and
 * never touching it again. Without this, a wallet that goes bad after being
 * tracked (account compromised, loses its edge, starts trading like a bot)
 * keeps its old, possibly inflated smartScore/pnl30d forever and keeps
 * influencing Trade Signals — this is the mechanism that catches that and
 * unwatches it.
 *
 * Wallets currently confirming a live buy/sell signal go first (see
 * selectRescoreBatch/getActiveSignalWalletAddresses) — their data feeds
 * today's conviction scores, so freshness matters most right now. Everyone
 * else still rotates through least-recently-rescored-first (nulls — never
 * rescored — go first), so every watched wallet eventually gets revisited.
 * `timeBudgetMs` should be however much time the caller actually has left
 * over (see the cron route) — a slow run just makes less progress this
 * tick and picks up where it left off next time; it never risks the
 * cron's overall ceiling.
 */
export async function rescoreWatchedWallets(timeBudgetMs = DEFAULT_RESCORE_TIME_BUDGET_MS): Promise<RescoreResult> {
  const startedAt = Date.now();
  const [allWatched, priorityAddresses] = await Promise.all([
    prisma.wallet.findMany({ where: { isWatched: true } }),
    getActiveSignalWalletAddresses(),
  ]);
  const wallets = selectRescoreBatch(allWatched, priorityAddresses, RESCORE_BATCH_SIZE);

  let attempted = 0;
  const unwatched: string[] = [];

  for (const wallet of wallets) {
    if (Date.now() - startedAt > timeBudgetMs) break;

    const result = await withTimeout(refreshWalletFromChain(wallet.address), RESCORE_PER_WALLET_TIMEOUT_MS);
    if (result === null) continue; // fetch failed or timed out — retry next rotation, don't touch lastRescoredAt

    attempted++;

    if (!result.hasActivity) {
      // No visible activity in the fetch window at all — inactivity-based
      // pruning (pruneStaleWallets) is the dedicated mechanism for that;
      // just deprioritize it in this rotation rather than double-judging it.
      await prisma.wallet.update({ where: { id: wallet.id }, data: { lastRescoredAt: new Date() } });
      continue;
    }

    const isWatched = shouldStayWatched(result.qualifies, result.pnlVerified);

    await prisma.wallet.update({
      where: { id: wallet.id },
      data: {
        smartScore: Math.round(result.score),
        pnl30d: result.pnl30d,
        fundingSource: result.fundingSource,
        isWatched,
        lastRescoredAt: new Date(),
      },
    });

    if (!isWatched) unwatched.push(wallet.address);
  }

  return { attempted, unwatched };
}
