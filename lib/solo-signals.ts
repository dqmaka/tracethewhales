import { prisma } from "./prisma";
import { BASE_TOKEN_MINTS } from "./constants";
import { getTokenOverview } from "./dexscreener";
import { CONVERGENCE_WINDOW_HOURS, MIN_SIGNAL_LIQUIDITY_USD } from "./signals";

// A single wallet, however proven, has no independent second confirmer —
// higher risk than a convergence signal, so both bars sit meaningfully above
// the existing WHALE_BUY *alert* thresholds (score 80 / $10k in lib/alerts.ts):
// this gets promoted all the way to a tracked Trade Signal + Telegram push,
// not just a feed item.
const SOLO_SIGNAL_MIN_SCORE = 85;
const SOLO_SIGNAL_MIN_USD = 15_000;
// Same window/floor as buy convergence signals (lib/signals.ts) — kept as
// separate constants rather than imported, same deliberate-divergence
// reasoning as lib/sell-signals.ts: these are allowed to diverge in tuning
// later without one accidentally affecting the other.
const SOLO_SIGNAL_WINDOW_HOURS = 48;
const FRESHNESS_FLOOR = 0.6;
// Mirrors MIN_CONVERGING_WALLETS in lib/signals.ts (not imported — it's
// private there, and this file's own reasonable-divergence convention
// already applies).
const MIN_CONVERGING_WALLETS = 2;
// Bounds enrichment cost the same way ENRICH_CAP does in lib/signals.ts —
// only the best-ranked candidates ever pay for a DexScreener lookup.
const ENRICH_CAP = 10;

export interface SoloConvictionWallet {
  address: string;
  label: string | null;
  score: number;
  pnl30d: number;
}

export interface SoloSignal {
  mint: string;
  symbol: string;
  wallet: SoloConvictionWallet;
  amountUsd: number;
  buyAt: Date;
  convictionScore: number;
  priceUsd: number | null;
  liquidityUsd: number | null;
}

/**
 * No multi-wallet averaging to do here (there's exactly one wallet) — the
 * wallet's own smartScore already blends behavior and realized profit (see
 * scoreProfit in lib/scoring.ts), so conviction is just that score decayed
 * by how long ago the buy happened. Same freshness-decay shape as
 * computeConviction/computeExitConviction, kept independent on purpose.
 */
export function computeSoloConviction(walletScore: number, buyAt: Date, now: Date = new Date()): number {
  const hoursSinceBuy = Math.max(0, (now.getTime() - buyAt.getTime()) / 3_600_000);
  const freshness = Math.max(
    FRESHNESS_FLOOR,
    1 - (hoursSinceBuy / SOLO_SIGNAL_WINDOW_HOURS) * (1 - FRESHNESS_FLOOR)
  );
  return Math.min(100, Math.round(walletScore * freshness));
}

/**
 * Token ids with 2+ independent tracked-wallet buyers in the convergence
 * window — solo signals deliberately exclude these. A token that already
 * qualifies (or would qualify but for liquidity) as a multi-wallet
 * convergence signal shouldn't also show up here; convergence is the
 * stronger claim, and showing both would just be confusing duplication.
 */
async function getConvergingTokenIds(): Promise<Set<string>> {
  const cutoff = new Date(Date.now() - CONVERGENCE_WINDOW_HOURS * 3_600_000);
  const buys = await prisma.transaction.findMany({
    where: { type: "BUY", occurredAt: { gte: cutoff }, wallet: { isWatched: true } },
    select: { tokenId: true, walletId: true },
  });

  const byToken = new Map<string, Set<string>>();
  for (const tx of buys) {
    const set = byToken.get(tx.tokenId) ?? new Set<string>();
    set.add(tx.walletId);
    byToken.set(tx.tokenId, set);
  }

  return new Set(
    [...byToken.entries()].filter(([, wallets]) => wallets.size >= MIN_CONVERGING_WALLETS).map(([tokenId]) => tokenId)
  );
}

/**
 * Finds recent, unusually large buys from exceptionally proven wallets that
 * never needed (or got) a second confirming wallet — a different, higher-
 * risk signal shape than getConvergenceSignals, meant to cover genuinely
 * strong single-wallet conviction bets that the convergence requirement
 * structurally can't catch.
 */
export async function getSoloConvictionSignals(limit = 10): Promise<SoloSignal[]> {
  const cutoff = new Date(Date.now() - SOLO_SIGNAL_WINDOW_HOURS * 3_600_000);
  const convergingTokenIds = await getConvergingTokenIds();

  const buys = await prisma.transaction.findMany({
    where: {
      type: "BUY",
      occurredAt: { gte: cutoff },
      amountUsd: { gte: SOLO_SIGNAL_MIN_USD },
      wallet: { isWatched: true, smartScore: { gte: SOLO_SIGNAL_MIN_SCORE } },
      token: { mint: { notIn: [...BASE_TOKEN_MINTS] } }, // SOL/USDC/USDT are the swap's other leg, not the bet
    },
    include: { wallet: true, token: true },
    orderBy: { amountUsd: "desc" },
  });

  // One signal per (wallet, token) — keep the largest qualifying buy if the
  // same wallet bought the same token more than once in the window (buys
  // are already sorted by amountUsd desc, so the first one seen per key
  // is the largest).
  const seen = new Set<string>();
  const candidates = buys.filter((tx) => {
    if (convergingTokenIds.has(tx.tokenId)) return false;
    const key = `${tx.walletId}|${tx.tokenId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const ranked = candidates
    .map((tx) => ({ tx, convictionScore: computeSoloConviction(tx.wallet.smartScore, tx.occurredAt) }))
    .sort((a, b) => b.convictionScore - a.convictionScore)
    .slice(0, ENRICH_CAP);

  const signals = await Promise.all(
    ranked.map(async ({ tx, convictionScore }): Promise<SoloSignal | null> => {
      let priceUsd: number | null = null;
      let liquidityUsd: number | null = null;
      try {
        const overview = await getTokenOverview(tx.token.mint);
        priceUsd = overview.priceUsd;
        liquidityUsd = overview.liquidityUsd;
      } catch (err) {
        console.warn(
          `Price/liquidity lookup failed for solo signal ${tx.token.symbol} (${tx.token.mint}):`,
          (err as Error).message
        );
      }

      // Same hard exclusion as buy convergence signals — a "signal" that
      // can't actually be traded at any real size isn't one. A failed
      // lookup (liquidityUsd still null) is kept, since an API hiccup isn't
      // proof the token is illiquid.
      if (liquidityUsd !== null && liquidityUsd < MIN_SIGNAL_LIQUIDITY_USD) return null;

      return {
        mint: tx.token.mint,
        symbol: tx.token.symbol,
        wallet: {
          address: tx.wallet.address,
          label: tx.wallet.label,
          score: tx.wallet.smartScore,
          pnl30d: tx.wallet.pnl30d,
        },
        amountUsd: tx.amountUsd,
        buyAt: tx.occurredAt,
        convictionScore,
        priceUsd,
        liquidityUsd,
      };
    })
  );

  return signals
    .filter((s): s is SoloSignal => s !== null)
    .sort((a, b) => b.convictionScore - a.convictionScore)
    .slice(0, limit);
}

const SOLO_SIGNAL_CACHE_ID = "latest_solo";
const SOLO_SIGNAL_CACHE_SIZE = 20;

/**
 * Same cache-refresh pattern as refreshSignalCache/refreshSellSignalCache —
 * computed once by the push-signals cron (which needs the same computation
 * to decide what to push), pages just read the cached result.
 */
export async function refreshSoloSignalCache(): Promise<SoloSignal[]> {
  const signals = await getSoloConvictionSignals(SOLO_SIGNAL_CACHE_SIZE);
  await prisma.signalCache.upsert({
    where: { id: SOLO_SIGNAL_CACHE_ID },
    update: { payload: signals as unknown as object, computedAt: new Date() },
    create: { id: SOLO_SIGNAL_CACHE_ID, payload: signals as unknown as object },
  });
  return signals;
}

/** JSON round-tripping turns Dates into strings — revive the one this shape relies on. */
function reviveSoloSignal(raw: SoloSignal): SoloSignal {
  return { ...raw, buyAt: new Date(raw.buyAt) };
}

export async function getCachedSoloConvictionSignals(limit = 10): Promise<SoloSignal[]> {
  const cached = await prisma.signalCache.findUnique({ where: { id: SOLO_SIGNAL_CACHE_ID } });
  if (!cached) return refreshSoloSignalCache().then((signals) => signals.slice(0, limit));

  const signals = (cached.payload as unknown as SoloSignal[]).map(reviveSoloSignal);
  return signals.slice(0, limit);
}
