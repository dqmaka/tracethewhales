import { prisma } from "./prisma";
import { BASE_TOKEN_MINTS } from "./constants";
import { getHistoricalPrice } from "./geckoterminal";
import { getTokenOverview } from "./dexscreener";
import { getMintAuthorities } from "./helius";

// GeckoTerminal's own throttle now runs ~2.1s/call (see lib/geckoterminal.ts)
// and can retry once on a 429, so a single candidate's enrichment can
// legitimately take 10s+ in the worst case — bounds that against a hard
// per-candidate deadline so one slow/retrying lookup can't eat the whole
// cron's budget. An abandoned candidate's promise keeps running in the
// background (no real JS cancellation without an AbortController threaded
// through) but no longer holds up the response; treated the same as any
// other enrichment failure (kept, just unverified).
const ENRICH_TIMEOUT_MS = 6_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

// A single wallet buying is already covered by the WHALE_BUY/LARGE_TRANSACTION
// alerts — the signal that's actually missing is *confirmation*: several
// independent, credible wallets buying the same token close together. That's
// the strongest edge a "smart money" tracker can surface, and we weren't
// computing it at all.
// 48h rather than 24h: with only a few dozen tracked wallets, two of them
// independently buying the exact same token inside any given day is rare —
// widening the window trades nothing for quality (the freshness decay below
// already de-prioritizes older overlaps), it just gives more raw material a
// chance to qualify at all.
export const CONVERGENCE_WINDOW_HOURS = 48;
const MIN_CONVERGING_WALLETS = 2;

// A signal's underlying quality doesn't change, but its *actionability*
// does — a token whose most recent confirming buy was 20 minutes ago is a
// much hotter opportunity than one where the last buy was 20 hours ago,
// even if both are technically still inside the 24h window. Linear decay
// from full strength right after the latest buy down to a floor that still
// respects the underlying wallet quality — freshness nudges ranking, it
// doesn't override it.
const FRESHNESS_FLOOR = 0.6;

// A "signal" is a promise that you could actually go execute this trade —
// that's false if the token can't absorb a real order, even if the % gain
// looks great on paper. Verified-low liquidity is a hard exclusion, not just
// a warning badge, unlike the softer flags below (which are real but more
// judgment-call-y). $50k (raised from $20k) keeps a ~$1.5-2.5k position
// under a safe ~3-5% share of the pool for both entry AND exit — $20k was
// only safe for much smaller trades.
// Exported so the token detail page can show the same low-liquidity warning
// on ANY token (not just ones that made it into a Signal) using one shared
// number instead of a second hardcoded copy.
export const MIN_SIGNAL_LIQUIDITY_USD = 50_000;
// Our own tracked buy volume being a large slice of the token's whole 24h
// volume means the "signal" might just be these wallets trading with each
// other/thin books, not a broad market actually absorbing size.
const THIN_MARKET_BUY_SHARE = 0.5;
// A market cap far above available liquidity means a real exit would move
// the price a lot — classic low-float/high-FDV slippage trap.
const HIGH_MC_LIQUIDITY_RATIO = 25;
// Each candidate needs 2 GeckoTerminal calls (pool lookup + OHLCV history —
// DexScreener covers the overview/liquidity leg, unthrottled by us),
// serialized through one shared throttle queue at ~2.1s/call (see
// geckoTerminalFetch in lib/geckoterminal.ts). All candidates enrich
// *concurrently* (see the Promise.all below) and each races its own
// ENRICH_TIMEOUT_MS deadline, so the whole batch is bounded at ~6s
// regardless of this count — raising it doesn't cost more worst-case time,
// it just means more candidates competing for the same queue's first ~2-3
// slots within that window (the rest safely time out as "unverified"
// rather than blocking anything). Conviction is entirely
// enrichment-independent, so ranking and capping *before* enrichment means
// only the best candidates ever pay that cost, and the function's runtime
// stays bounded regardless of how many tokens technically qualify.
const ENRICH_CAP = 8;

export interface ConvergingWallet {
  address: string;
  label: string | null;
  score: number;
  pnl30d: number;
  amountUsd: number;
  lastBuyAt: Date;
  fundingSource: string | null;
}

export interface ConvictionResult {
  wallets: ConvergingWallet[];
  convictionScore: number;
  lastBuyAt: Date;
}

/**
 * Pure ranking math, deliberately separated from the DB query +
 * GeckoTerminal/DexScreener enrichment around it — conviction only needs
 * wallet quality/timing data
 * already in hand (see the call site in getConvergenceSignals), and keeping
 * it side-effect-free makes it directly testable without mocking Prisma.
 */
export function computeConviction(wallets: ConvergingWallet[], now: Date = new Date()): ConvictionResult {
  const sorted = [...wallets].sort((a, b) => b.amountUsd - a.amountUsd);
  // w.score (Wallet.smartScore) already blends in a realized-profit
  // component (see scoreProfit in lib/scoring.ts) — used directly here
  // instead of re-blending pnl30d a second time on top, which would let
  // profitability dominate the quality signal twice over.
  const avgQuality = sorted.reduce((sum, w) => sum + w.score, 0) / sorted.length;
  // Each additional confirming wallet adds a flat bonus on top of average
  // quality — rewards both "how good/proven these wallets are" and "how
  // many independently agree", without letting sheer headcount dominate.
  const baseScore = Math.min(100, avgQuality + (sorted.length - 1) * 8);

  const lastBuyAt = new Date(Math.max(...sorted.map((w) => w.lastBuyAt.getTime())));
  const hoursSinceLastBuy = Math.max(0, (now.getTime() - lastBuyAt.getTime()) / 3_600_000);
  const freshness = Math.max(
    FRESHNESS_FLOOR,
    1 - (hoursSinceLastBuy / CONVERGENCE_WINDOW_HOURS) * (1 - FRESHNESS_FLOOR)
  );
  const convictionScore = Math.min(100, Math.round(baseScore * freshness));

  return { wallets: sorted, convictionScore, lastBuyAt };
}

export interface RiskFlag {
  type: "thin_market" | "high_mc_ratio" | "unverified_liquidity" | "shared_funding_source";
  message: string;
}

export interface ConvergenceSignal {
  mint: string;
  symbol: string;
  walletCount: number;
  wallets: ConvergingWallet[];
  totalBuyUsd: number;
  firstBuyAt: Date;
  lastBuyAt: Date;
  convictionScore: number;
  priceAtTrigger: number | null;
  priceNow: number | null;
  /** % price move since the first confirming buy — a large positive number
   * means the entry this signal points to has likely already run; null when
   * we couldn't get both price points. */
  priceChangeSinceTriggerPercent: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  marketCapUsd: number | null;
  riskFlags: RiskFlag[];
  /** null = the on-chain lookup itself failed — distinct from a verified
   * "renounced" (false). Never treat null as "safe". Same source as the
   * token detail page's rug-risk badges (lib/helius.ts's getMintAuthorities),
   * fetched here too so list views can show it without a click-through. */
  mintAuthorityActive: boolean | null;
  freezeAuthorityActive: boolean | null;
  /** Close prices from the same GeckoTerminal history call already fetched
   * for priceAtTrigger below — kept as a plain array (not re-fetched) so a
   * list row can show a tiny price trend without its own extra API cost. */
  priceSpark: number[];
}

/**
 * Groups every tracked wallet's BUYs of the last CONVERGENCE_WINDOW_HOURS by
 * token, keeps only tokens bought by at least MIN_CONVERGING_WALLETS
 * *distinct* wallets, and attaches a "has this already run" price check via
 * GeckoTerminal (current price vs. price at the first confirming buy).
 */
export async function getConvergenceSignals(limit = 10): Promise<ConvergenceSignal[]> {
  const cutoff = new Date(Date.now() - CONVERGENCE_WINDOW_HOURS * 60 * 60 * 1000);

  const buys = await prisma.transaction.findMany({
    where: { type: "BUY", occurredAt: { gte: cutoff }, wallet: { isWatched: true } },
    include: { wallet: true, token: true },
    orderBy: { occurredAt: "asc" },
  });

  const byToken = new Map<
    string,
    { symbol: string; mint: string; wallets: Map<string, ConvergingWallet>; firstBuyAt: Date }
  >();

  for (const tx of buys) {
    if (BASE_TOKEN_MINTS.has(tx.token.mint)) continue; // SOL/USDC/USDT are the swap's other leg, not the bet

    const group = byToken.get(tx.tokenId) ?? {
      symbol: tx.token.symbol,
      mint: tx.token.mint,
      wallets: new Map<string, ConvergingWallet>(),
      firstBuyAt: tx.occurredAt,
    };
    if (tx.occurredAt < group.firstBuyAt) group.firstBuyAt = tx.occurredAt;

    const existing = group.wallets.get(tx.walletId);
    if (existing) {
      existing.amountUsd += tx.amountUsd;
      if (tx.occurredAt > existing.lastBuyAt) existing.lastBuyAt = tx.occurredAt;
    } else {
      group.wallets.set(tx.walletId, {
        address: tx.wallet.address,
        label: tx.wallet.label,
        score: tx.wallet.smartScore,
        pnl30d: tx.wallet.pnl30d,
        amountUsd: tx.amountUsd,
        lastBuyAt: tx.occurredAt,
        fundingSource: tx.wallet.fundingSource,
      });
    }
    byToken.set(tx.tokenId, group);
  }

  // Conviction only needs wallet/quality/timing data already in hand —
  // compute and rank on it *before* touching GeckoTerminal, so the expensive
  // per-candidate enrichment below only ever runs for the top ENRICH_CAP.
  const ranked = [...byToken.values()]
    .filter((g) => g.wallets.size >= MIN_CONVERGING_WALLETS)
    .map((g) => {
      const { wallets, convictionScore, lastBuyAt } = computeConviction([...g.wallets.values()]);
      return { group: g, wallets, convictionScore, lastBuyAt };
    })
    .sort((a, b) => b.convictionScore - a.convictionScore)
    .slice(0, ENRICH_CAP);

  const signals = await Promise.all(
    ranked.map(async ({ group: g, wallets, convictionScore, lastBuyAt }): Promise<ConvergenceSignal | null> => {
      const totalBuyUsd = wallets.reduce((sum, w) => sum + w.amountUsd, 0);

      let priceAtTrigger: number | null = null;
      let priceNow: number | null = null;
      let liquidityUsd: number | null = null;
      let volume24hUsd: number | null = null;
      let marketCapUsd: number | null = null;
      let priceSpark: number[] = [];
      let mintAuthorityActive: boolean | null = null;
      let freezeAuthorityActive: boolean | null = null;
      try {
        const to = Math.floor(Date.now() / 1000);
        const from = Math.floor(g.firstBuyAt.getTime() / 1000) - 3600;
        const enrichment = await withTimeout(
          Promise.all([
            getHistoricalPrice(g.mint, { from, to, type: "1H" }),
            getTokenOverview(g.mint),
            // Independent of the two calls above — a failure here shouldn't
            // cost the signal its price/liquidity data, so it's caught on
            // its own rather than left to reject the whole Promise.all.
            getMintAuthorities(g.mint).catch(() => null),
          ]),
          ENRICH_TIMEOUT_MS
        );
        if (enrichment === null) {
          console.warn(`Price/liquidity lookup timed out for signal ${g.symbol} (${g.mint})`);
        } else {
          const [history, overview, authorities] = enrichment;
          priceNow = overview.priceUsd;
          liquidityUsd = overview.liquidityUsd;
          volume24hUsd = overview.volume24hUsd;
          marketCapUsd = overview.marketCapUsd;
          priceSpark = history.map((p) => p.value);
          if (authorities) {
            mintAuthorityActive = authorities.mintAuthority !== null;
            freezeAuthorityActive = authorities.freezeAuthority !== null;
          }
          if (history.length > 0) {
            const targetTime = Math.floor(g.firstBuyAt.getTime() / 1000);
            priceAtTrigger = history.reduce((closest, p) =>
              Math.abs(p.unixTime - targetTime) < Math.abs(closest.unixTime - targetTime) ? p : closest
            ).value;
          }
        }
      } catch (err) {
        console.warn(`Price/liquidity lookup failed for signal ${g.symbol} (${g.mint}):`, (err as Error).message);
      }

      // Verified-low liquidity means this "signal" isn't actually tradeable
      // at any meaningful size — drop it rather than show a trap. A failed
      // lookup (liquidityUsd still null) is kept but flagged, since an API
      // hiccup isn't proof the token is illiquid.
      if (liquidityUsd !== null && liquidityUsd < MIN_SIGNAL_LIQUIDITY_USD) return null;

      const riskFlags: RiskFlag[] = [];
      // "Independent confirmation" is the entire premise of this signal — if
      // 2+ of the confirming wallets were topped up from the same source,
      // they may just be the same person/bot spread across addresses, not
      // real independent conviction. fundingSource is a best-effort recent
      // top-up sender (see findFundingSource in discovery.ts), not a
      // guaranteed wallet-genesis funder, so treat this as a flag to
      // investigate, not an automatic disqualification.
      const fundingGroups = new Map<string, number>();
      for (const w of wallets) {
        if (!w.fundingSource) continue;
        fundingGroups.set(w.fundingSource, (fundingGroups.get(w.fundingSource) ?? 0) + 1);
      }
      const sharedFunders = [...fundingGroups.values()].filter((count) => count >= 2);
      if (sharedFunders.length > 0) {
        const maxShared = Math.max(...sharedFunders);
        riskFlags.push({
          type: "shared_funding_source",
          message: `${maxShared} of ${wallets.length} wallets were recently funded from the same source — may not be independent`,
        });
      }
      if (liquidityUsd === null) {
        riskFlags.push({ type: "unverified_liquidity", message: "Liquidity could not be verified" });
      } else {
        if (volume24hUsd !== null && volume24hUsd > 0 && totalBuyUsd / volume24hUsd > THIN_MARKET_BUY_SHARE) {
          riskFlags.push({
            type: "thin_market",
            message: `Tracked buy volume is ${Math.round((totalBuyUsd / volume24hUsd) * 100)}% of total 24h volume — thin market`,
          });
        }
        if (marketCapUsd !== null && liquidityUsd > 0 && marketCapUsd / liquidityUsd > HIGH_MC_LIQUIDITY_RATIO) {
          riskFlags.push({
            type: "high_mc_ratio",
            message: "Market cap high relative to liquidity — higher slippage risk",
          });
        }
      }

      const priceChangeSinceTriggerPercent =
        priceAtTrigger !== null && priceNow !== null && priceAtTrigger > 0
          ? Math.round(((priceNow - priceAtTrigger) / priceAtTrigger) * 1000) / 10
          : null;

      return {
        mint: g.mint,
        symbol: g.symbol,
        walletCount: wallets.length,
        wallets,
        totalBuyUsd,
        firstBuyAt: g.firstBuyAt,
        lastBuyAt,
        convictionScore,
        priceAtTrigger,
        priceNow,
        priceChangeSinceTriggerPercent,
        liquidityUsd,
        volume24hUsd,
        marketCapUsd,
        riskFlags,
        mintAuthorityActive,
        freezeAuthorityActive,
        priceSpark,
      };
    })
  );

  return signals
    .filter((s): s is ConvergenceSignal => s !== null)
    .sort((a, b) => b.convictionScore - a.convictionScore)
    .slice(0, limit);
}

const SIGNAL_CACHE_ID = "latest";
// How many signals the cache holds — pages read a slice of this, so it only
// needs to cover the largest limit any page actually requests (/signals
// asks for 20).
const SIGNAL_CACHE_SIZE = 20;

/**
 * Computes the full (expensive) signal list once and stores it — the only
 * place that should ever call getConvergenceSignals directly outside of this
 * cache refresh. Called by the push-signals cron, which already needs the
 * same computation to decide what to push to Telegram, so this is the one
 * spot paying the GeckoTerminal/DexScreener cost, not every page load.
 */
export async function refreshSignalCache(): Promise<ConvergenceSignal[]> {
  const signals = await getConvergenceSignals(SIGNAL_CACHE_SIZE);
  await prisma.signalCache.upsert({
    where: { id: SIGNAL_CACHE_ID },
    update: { payload: signals as unknown as object, computedAt: new Date() },
    create: { id: SIGNAL_CACHE_ID, payload: signals as unknown as object },
  });
  return signals;
}

/**
 * JSON round-tripping turns Dates into strings — revive the ones pages rely
 * on. Also backfills fields that didn't exist yet when a still-cached
 * payload was written (the cache row persists across deploys — a signal
 * cached by yesterday's code literally doesn't have today's new keys at
 * all, not even as `null`) — without this, a page reading a pre-upgrade
 * cache entry would crash on `s.priceSpark.length` rather than just show
 * "unknown" for the new fields until the next push-signals cron tick
 * recomputes it.
 */
function reviveSignal(raw: ConvergenceSignal): ConvergenceSignal {
  return {
    ...raw,
    firstBuyAt: new Date(raw.firstBuyAt),
    lastBuyAt: new Date(raw.lastBuyAt),
    wallets: raw.wallets.map((w) => ({ ...w, lastBuyAt: new Date(w.lastBuyAt) })),
    mintAuthorityActive: raw.mintAuthorityActive ?? null,
    freezeAuthorityActive: raw.freezeAuthorityActive ?? null,
    priceSpark: raw.priceSpark ?? [],
  };
}

/**
 * Fast path for pages: reads the last cache refresh instead of recomputing
 * live. Falls back to a live (slow) computation only if the cache has never
 * been populated yet — e.g. right after this feature first deploys, before
 * the push-signals cron has run once.
 */
export async function getCachedConvergenceSignals(limit = 10): Promise<ConvergenceSignal[]> {
  const cached = await prisma.signalCache.findUnique({ where: { id: SIGNAL_CACHE_ID } });
  if (!cached) return refreshSignalCache().then((signals) => signals.slice(0, limit));

  const signals = (cached.payload as unknown as ConvergenceSignal[]).map(reviveSignal);
  return signals.slice(0, limit);
}
