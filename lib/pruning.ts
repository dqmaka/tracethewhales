import { prisma } from "./prisma";

// A wallet that hasn't produced a single tracked transaction in this many
// days isn't giving us live intel anymore — the webhook has nothing to alert
// on, and its smartScore only ever gets recomputed when it resurfaces as a
// discovery candidate (the webhook itself never touches it, see
// app/api/webhooks/helius/route.ts). Left alone, the tracked-wallet list
// just accumulates dead weight over time.
const STALE_INACTIVITY_DAYS = 14;

// No genuine human trader manually executes hundreds of swaps a day; a
// wallet blowing past this is a scripted bot regardless of what its
// behavior/PnL score says (live-observed: several "Smart Money" wallets
// doing 2,000-10,000+ trades/24h — each one a Helius "enhanced" webhook
// delivery, which is what actually burned a 1M-credit/month Helius plan
// down to zero in days). Pure DB read/write, no Helius call — so this still
// runs (and still cuts webhook volume) even while Helius itself is down,
// unlike the score-based bot penalties in discovery.ts which need a fresh
// Helius transaction fetch to re-evaluate a wallet.
const HIGH_VOLUME_TRADES_PER_DAY = 300;

export interface PruneResult {
  prunedCount: number;
  prunedAddresses: string[];
}

/**
 * Soft-prunes stale wallets: flips isWatched to false rather than deleting
 * anything, so transaction/score history stays intact and a wallet that
 * becomes active again can simply be re-discovered. isWatched already gates
 * the webhook's tracked-address set and every "active wallets" query, so
 * this is the same lever discovery.ts uses to *add* wallets, just in reverse.
 */
export async function pruneStaleWallets(): Promise<PruneResult> {
  const cutoff = new Date(Date.now() - STALE_INACTIVITY_DAYS * 86_400_000);

  const candidates = await prisma.wallet.findMany({
    where: { isWatched: true },
    select: {
      id: true,
      address: true,
      firstSeenAt: true,
      transactions: { orderBy: { occurredAt: "desc" }, take: 1, select: { occurredAt: true } },
    },
  });

  // Falls back to firstSeenAt for a wallet with zero recorded transactions
  // yet — gives a freshly-discovered wallet a full grace period before it
  // can be pruned for "inactivity" it never had a chance to disprove.
  const stale = candidates.filter((w) => {
    const lastActivity = w.transactions[0]?.occurredAt ?? w.firstSeenAt;
    return lastActivity < cutoff;
  });

  if (stale.length > 0) {
    await prisma.wallet.updateMany({
      where: { id: { in: stale.map((w) => w.id) } },
      data: { isWatched: false },
    });
  }

  return { prunedCount: stale.length, prunedAddresses: stale.map((w) => w.address) };
}

/**
 * Soft-prunes wallets whose own recorded transaction volume makes them
 * obvious automation, independent of (and much faster than) the score-based
 * bot penalties in discovery.ts, which only re-run a wallet at a time via
 * rescoreWatchedWallets's rotation — too slow to catch a wallet that ramps
 * up to thousands of trades/day between rotations.
 */
export async function pruneHighVolumeWallets(): Promise<PruneResult> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const grouped = await prisma.transaction.groupBy({
    by: ["walletId"],
    where: { occurredAt: { gte: since }, wallet: { isWatched: true } },
    _count: { _all: true },
    having: { walletId: { _count: { gt: HIGH_VOLUME_TRADES_PER_DAY } } },
  });

  if (grouped.length === 0) {
    return { prunedCount: 0, prunedAddresses: [] };
  }

  const walletIds = grouped.map((g) => g.walletId);
  const wallets = await prisma.wallet.findMany({
    where: { id: { in: walletIds } },
    select: { id: true, address: true },
  });

  await prisma.wallet.updateMany({
    where: { id: { in: walletIds } },
    data: { isWatched: false },
  });

  return { prunedCount: wallets.length, prunedAddresses: wallets.map((w) => w.address) };
}
