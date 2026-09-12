import { prisma } from "./prisma";
import { BASE_TOKEN_MINTS } from "./constants";
import { getTokenOverview } from "./dexscreener";
import { CONVERGENCE_WINDOW_HOURS } from "./signals";

// Mirrors MIN_CONVERGING_WALLETS / FRESHNESS_FLOOR in lib/signals.ts, kept as
// separate constants (not imported) since the buy- and sell-side thresholds
// may reasonably diverge later — same values for now by deliberate choice.
const MIN_CONVERGING_SELLERS = 2;
const FRESHNESS_FLOOR = 0.6;
// Deliberately DexScreener-only (no Birdeye historical-price lookup like the
// buy-side signal has) — an exit alert doesn't need a "price since trigger"
// chart to be useful, and Birdeye's account quota has already been the
// recurring bottleneck this project keeps running into. Keeping this path
// 100% unthrottled means it can't make that worse.
const ENRICH_CAP = 12;

export interface ConvergingSeller {
  address: string;
  label: string | null;
  score: number;
  pnl30d: number;
  amountUsd: number;
  lastSellAt: Date;
  fundingSource: string | null;
}

export interface SellConvergenceSignal {
  mint: string;
  symbol: string;
  sellerCount: number;
  sellers: ConvergingSeller[];
  totalSellUsd: number;
  firstSellAt: Date;
  lastSellAt: Date;
  exitConvictionScore: number;
  priceUsd: number | null;
  liquidityUsd: number | null;
  /** True if we previously pushed a BUY signal for this exact token — turns
   * this from a generic sell cluster into "wallets are now getting out of
   * something we recommended". */
  wasPreviouslyPushedAsBuy: boolean;
}

export interface ExitConvictionResult {
  sellers: ConvergingSeller[];
  convictionScore: number;
  lastSellAt: Date;
}

/**
 * Same shape of math as computeConviction in lib/signals.ts (quality ×
 * headcount, decayed by freshness), kept as its own small pure function
 * rather than a shared generic — the two are allowed to diverge in tuning
 * without one accidentally breaking the other. Directly testable without
 * touching Prisma.
 */
export function computeExitConviction(sellers: ConvergingSeller[], now: Date = new Date()): ExitConvictionResult {
  const sorted = [...sellers].sort((a, b) => b.amountUsd - a.amountUsd);
  // w.score (Wallet.smartScore) already blends in a realized-profit
  // component (see scoreProfit in lib/scoring.ts) — used directly, same as
  // the buy-side computeConviction in lib/signals.ts.
  const avgQuality = sorted.reduce((sum, w) => sum + w.score, 0) / sorted.length;
  const baseScore = Math.min(100, avgQuality + (sorted.length - 1) * 8);

  const lastSellAt = new Date(Math.max(...sorted.map((w) => w.lastSellAt.getTime())));
  const hoursSinceLastSell = Math.max(0, (now.getTime() - lastSellAt.getTime()) / 3_600_000);
  const freshness = Math.max(
    FRESHNESS_FLOOR,
    1 - (hoursSinceLastSell / CONVERGENCE_WINDOW_HOURS) * (1 - FRESHNESS_FLOOR)
  );
  const convictionScore = Math.min(100, Math.round(baseScore * freshness));

  return { sellers: sorted, convictionScore, lastSellAt };
}

/**
 * Symmetric counterpart to getConvergenceSignals: tokens where 2+
 * independent tracked wallets have SOLD recently, instead of bought. Entry
 * timing isn't the whole story for avoiding losses — knowing when the same
 * "smart money" is heading for the exit matters just as much, especially
 * for a token we ourselves flagged as a buy earlier.
 */
export async function getSellConvergenceSignals(limit = 10): Promise<SellConvergenceSignal[]> {
  const cutoff = new Date(Date.now() - CONVERGENCE_WINDOW_HOURS * 60 * 60 * 1000);

  const sells = await prisma.transaction.findMany({
    where: { type: "SELL", occurredAt: { gte: cutoff }, wallet: { isWatched: true } },
    include: { wallet: true, token: true },
    orderBy: { occurredAt: "asc" },
  });

  const byToken = new Map<
    string,
    { symbol: string; mint: string; sellers: Map<string, ConvergingSeller>; firstSellAt: Date }
  >();

  for (const tx of sells) {
    if (BASE_TOKEN_MINTS.has(tx.token.mint)) continue; // SOL/USDC/USDT are the swap's other leg, not the position

    const group = byToken.get(tx.tokenId) ?? {
      symbol: tx.token.symbol,
      mint: tx.token.mint,
      sellers: new Map<string, ConvergingSeller>(),
      firstSellAt: tx.occurredAt,
    };
    if (tx.occurredAt < group.firstSellAt) group.firstSellAt = tx.occurredAt;

    const existing = group.sellers.get(tx.walletId);
    if (existing) {
      existing.amountUsd += tx.amountUsd;
      if (tx.occurredAt > existing.lastSellAt) existing.lastSellAt = tx.occurredAt;
    } else {
      group.sellers.set(tx.walletId, {
        address: tx.wallet.address,
        label: tx.wallet.label,
        score: tx.wallet.smartScore,
        pnl30d: tx.wallet.pnl30d,
        amountUsd: tx.amountUsd,
        lastSellAt: tx.occurredAt,
        fundingSource: tx.wallet.fundingSource,
      });
    }
    byToken.set(tx.tokenId, group);
  }

  // Same pattern as the buy side: rank on data already in hand *before*
  // touching any external API, so enrichment only ever runs for the top
  // ENRICH_CAP candidates.
  const ranked = [...byToken.values()]
    .filter((g) => g.sellers.size >= MIN_CONVERGING_SELLERS)
    .map((g) => {
      const { sellers, convictionScore, lastSellAt } = computeExitConviction([...g.sellers.values()]);
      return { group: g, sellers, convictionScore, lastSellAt };
    })
    .sort((a, b) => b.convictionScore - a.convictionScore)
    .slice(0, ENRICH_CAP);

  const previouslyPushed = await prisma.pushedSignal.findMany({
    where: { mint: { in: ranked.map((r) => r.group.mint) } },
    select: { mint: true },
  });
  const previouslyPushedMints = new Set(previouslyPushed.map((p) => p.mint));

  const signals = await Promise.all(
    ranked.map(async ({ group: g, sellers, convictionScore, lastSellAt }): Promise<SellConvergenceSignal> => {
      const totalSellUsd = sellers.reduce((sum, s) => sum + s.amountUsd, 0);

      let priceUsd: number | null = null;
      let liquidityUsd: number | null = null;
      try {
        const overview = await getTokenOverview(g.mint);
        priceUsd = overview.priceUsd;
        liquidityUsd = overview.liquidityUsd;
      } catch (err) {
        console.warn(`Price/liquidity lookup failed for exit signal ${g.symbol} (${g.mint}):`, (err as Error).message);
      }

      return {
        mint: g.mint,
        symbol: g.symbol,
        sellerCount: sellers.length,
        sellers,
        totalSellUsd,
        firstSellAt: g.firstSellAt,
        lastSellAt,
        exitConvictionScore: convictionScore,
        priceUsd,
        liquidityUsd,
        wasPreviouslyPushedAsBuy: previouslyPushedMints.has(g.mint),
      };
    })
  );

  return signals.sort((a, b) => b.exitConvictionScore - a.exitConvictionScore).slice(0, limit);
}

const SELL_SIGNAL_CACHE_ID = "latest_sell";
const SELL_SIGNAL_CACHE_SIZE = 20;

/** Same rationale as refreshSignalCache in lib/signals.ts — the push cron
 * already needs the full live computation, so it's the one place that pays
 * for it; page reads are a plain DB read via getCachedSellConvergenceSignals. */
export async function refreshSellSignalCache(): Promise<SellConvergenceSignal[]> {
  const signals = await getSellConvergenceSignals(SELL_SIGNAL_CACHE_SIZE);
  await prisma.signalCache.upsert({
    where: { id: SELL_SIGNAL_CACHE_ID },
    update: { payload: signals as unknown as object, computedAt: new Date() },
    create: { id: SELL_SIGNAL_CACHE_ID, payload: signals as unknown as object },
  });
  return signals;
}

function reviveSellSignal(raw: SellConvergenceSignal): SellConvergenceSignal {
  return {
    ...raw,
    firstSellAt: new Date(raw.firstSellAt),
    lastSellAt: new Date(raw.lastSellAt),
    sellers: raw.sellers.map((s) => ({ ...s, lastSellAt: new Date(s.lastSellAt) })),
  };
}

export async function getCachedSellConvergenceSignals(limit = 10): Promise<SellConvergenceSignal[]> {
  const cached = await prisma.signalCache.findUnique({ where: { id: SELL_SIGNAL_CACHE_ID } });
  if (!cached) return refreshSellSignalCache().then((signals) => signals.slice(0, limit));

  const signals = (cached.payload as unknown as SellConvergenceSignal[]).map(reviveSellSignal);
  return signals.slice(0, limit);
}
