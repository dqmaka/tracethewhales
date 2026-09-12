import { prisma } from "./prisma";

// A wallet that hasn't produced a single tracked transaction in this many
// days isn't giving us live intel anymore — the webhook has nothing to alert
// on, and its smartScore only ever gets recomputed when it resurfaces as a
// discovery candidate (the webhook itself never touches it, see
// app/api/webhooks/helius/route.ts). Left alone, the tracked-wallet list
// just accumulates dead weight over time.
const STALE_INACTIVITY_DAYS = 14;

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
