import { prisma } from "./prisma";
import { getGainersLosers, getTopTraders, getWalletPnlSummary, type BirdeyeTraderRow } from "./birdeye";
import { getTrendingTokens, type JupiterTrendingToken } from "./jupiter";
import { getEnhancedTransactions, getEarlyBuyers, type HeliusEnhancedTransaction } from "./helius";
import { getLeaderboard, getTraderTrades } from "./fomo";
import { calculateSmartScore, type ScorableTransaction } from "./scoring";
import { toScorableTransactions } from "./wallet-activity";
import { syncHeliusWebhook } from "./webhook-sync";
import { BASE_TOKEN_MINTS } from "./constants";
import { pruneStaleWallets, pruneHighVolumeWallets, type PruneResult } from "./pruning";

const SMART_SCORE_THRESHOLD = 60;
// Second, independent qualification path: our own behavioral score penalizes
// low-frequency wallets (few trades, each large), which is exactly the shape
// of a real insider/conviction bet — so a proven big real winner qualifies
// even with a mediocre behavioral score. Checked against ALL-TIME total PnL
// (realized + unrealized), not a 30d window and not win_rate — Birdeye's own
// docs say win_rate "only accounts for fully realized tokens", so a wallet
// that simply never closes its losers can post a fake-clean win_rate; total
// PnL already marks open losses to market and can't be gamed that way.
const BIRDEYE_PNL_QUALIFY_USD = 5000;
// FOMO's leaderboard is an independently-vetted ranking of real, verified
// traders (real PnL, real followers) — candidates sourced from it skip our
// own qualification gates entirely, they're already proven.
const FOMO_LEADERBOARD_LIMIT = 25;
// How much weight a trusted (FOMO-sourced) candidate's own Solana behavior
// gets against its external leaderboard rank. Majority weight, not a max():
// behaviorScore now carries its own realized-profit component (see
// scoreProfit in lib/scoring.ts), so a wallet that's currently trading badly
// on Solana shouldn't get rescued to a 70+ score purely because it once
// ranked well elsewhere — that was letting a stale external rank silently
// override what we can directly observe right now. Still a meaningful
// minority weight for the rank itself, since our behavioral score only reads
// Solana activity and can't see genuine cross-chain skill on its own.
const TRUSTED_BEHAVIOR_WEIGHT = 0.7;
// Gathering candidates is cheap (a handful of API calls, done once per run)
// — only *processing* them is the bottleneck (see DISCOVERY_TIME_BUDGET_MS),
// so a bigger reservoir here costs nothing and just means less of the pool
// goes unconsidered before the time budget cuts the run off.
const MAX_CANDIDATES = 40;
// FOMO's leaderboard pnlUsd is documented as realized-only — the same
// never-close-your-losers trick applies. Sample recent trades and penalize
// wallets sitting on a pile of unclosed, underwater positions.
const BAG_HOLDING_SAMPLE_SIZE = 30;
const BAG_HOLDING_MAX_PENALTY = 25;
const BAG_HOLDING_OPEN_RATIO_FLOOR = 0.6;
// Catches the "spray a fixed tiny SOL amount into every fresh pump.fun
// launch and hope one moons" bot: many near-identical tiny buys, zero
// sells, all from the same launchpad. A real trader's position sizes vary
// and they eventually close *some* trades — this pattern is neither.
// Applies to trusted (FOMO-sourced) candidates too, since that path is
// exactly where it was slipping through: an external leaderboard rank can
// vouch for a trader's *overall* track record while we're only looking at
// a handful of pump.fun snipes in our own tracked window, and our own gate
// only ever took Math.max(behaviorScore, rankScore) — never let a bad
// pattern *we* can see pull the score down.
const SNIPER_BOT_MIN_SAMPLE = 3;
const SNIPER_BOT_MAX_AVG_BUY_USD = 5;
const SNIPER_BOT_MAX_SIZE_VARIATION = 0.25; // coefficient of variation (stddev/mean)
const SNIPER_BOT_PENALTY = 40;
// Verified against live Helius data across tracked wallets: pump.fun swaps
// show up under both tags, with PUMP_AMM actually the *dominant* one in
// practice — matching "PUMP_FUN" alone missed most real pump.fun activity.
// Deliberately excludes general-purpose routers/DEXs (JUPITER,
// OKX_DEX_ROUTER, ORCA, TITAN, BYREAL, ...) that real active traders route
// through constantly — those aren't launchpads, including them would flag
// half the tracked wallets.
const SNIPER_BOT_LAUNCHPAD_SOURCES = new Set(["PUMP_FUN", "PUMP_AMM"]);
// A second, independent bot signature: trades spaced at a suspiciously
// regular, fast cadence. A human deciding to buy is irregular — a script
// polling for opportunities on a timer isn't. Applies regardless of size or
// venue, so it catches automation the sniper check's launchpad/size gates
// don't (e.g. an arb/MEV-style bot that also sells).
const HFT_BOT_MIN_SAMPLE = 6;
const HFT_BOT_MAX_AVG_INTERVAL_MINUTES = 5;
const HFT_BOT_MAX_INTERVAL_VARIATION = 0.4; // coefficient of variation of time-between-trades
const HFT_BOT_PENALTY = 30;
// The sniper check above only fires on tiny (≤$5) buys from a launchpad — a
// copy-trading or accumulation bot that templates a *large* fixed size (e.g.
// always exactly 2 SOL, on any venue) sails straight through it. This is the
// same "every position is the same size" tell, deliberately decoupled from
// both the dollar cap and the launchpad requirement, so it catches bots
// "ob grosse oder kleine Beträge" (regardless of trade size). Tighter
// variation threshold than the sniper check since it has no corroborating
// size/venue signal to lean on — uniform size alone needs to be a stronger
// fit before it's trusted as bot evidence. A near-zero (not strictly zero)
// sell ratio still admits a bot that occasionally offloads.
const TEMPLATED_SIZE_MIN_SAMPLE = 5;
const TEMPLATED_SIZE_MAX_VARIATION = 0.15; // coefficient of variation
const TEMPLATED_SIZE_MAX_SELL_RATIO = 0.2;
const TEMPLATED_SIZE_PENALTY = 25;
// A real insider holds a conviction position; a flip-bot buys and dumps
// within minutes regardless of position size. Measures BUY→first-SELL hold
// time per token, independent of trade size or venue — catches wash/flip
// bots that the sniper and HFT checks miss (they do sell, and not
// necessarily on a rigid cadence, just always fast).
const FLIP_BOT_MIN_ROUND_TRIPS = 3;
const FLIP_BOT_MAX_AVG_HOLD_MINUTES = 10;
const FLIP_BOT_PENALTY = 30;
// A wallet whose entire visible history is younger than a day yet already
// has a double-digit trade count is far more likely a disposable bot/sybil
// wallet spun up for one campaign than a "real user" with an established
// presence — genuine insiders have a wallet history, not just a trading
// script's output. Lower bound on true age (txs beyond TX_HISTORY_LIMIT
// aren't visible), which only makes this conservative: if the fetch window
// is full, the wallet did at least that many trades within the visible
// window regardless of how old the account itself might be.
const FRESH_WALLET_MAX_AGE_HOURS = 24;
const FRESH_WALLET_MIN_TX_COUNT = 10;
const FRESH_WALLET_PENALTY = 20;
// All five checks are real, independent evidence, but stacking them
// shouldn't be able to zero out an otherwise-legitimate score entirely on
// heuristics alone.
const MAX_COMBINED_BOT_PENALTY = 70;
// Fetched wide, then filtered client-side (see collectEarlyBuyerCandidates)
// for liquidity/organic-score/audit — kept in Jupiter's own trending order
// rather than re-sorted by a metric of ours, and by volume SOL/base pairs
// dominate every single call, making "early SOL buyer" a meaningless smart
// money signal since virtually every wallet touches SOL as the base pair.
const TRENDING_POOL_SIZE = 20;
const MAX_TRENDING_TOKENS = 4;
const MIN_TRENDING_LIQUIDITY_USD = 50_000;
// 24h alone misses short-term momentum that peaks and fades within a
// window it doesn't cover — merged (deduped by mint) before filtering, not
// run as two separate candidate pools, so the same liquidity/organic/audit
// bar still applies to both.
const TRENDING_INTERVALS: Array<"1h" | "24h"> = ["1h", "24h"];
const EARLY_BUYERS_PER_TOKEN = 5;
const EARLY_BUYERS_LOOKBACK = 100;
const GAINERS_LOSERS_LIMIT = 10;
// Top traders (biggest position size) is a genuinely different signal than
// early buyers (fastest timing) for the same trending tokens — this Birdeye
// call already existed (getTopTraders) but had no caller. Limited to fewer
// tokens than the early-buyer lookup since each hit goes through Birdeye's
// shared ~1 req/sec throttle and adds real serialized latency to the
// (unbounded) candidate-gathering phase, unlike the Helius-based lookups.
const TOP_TRADERS_TOKEN_LIMIT = 2;
const TOP_TRADERS_PER_TOKEN = 5;
// Exported so lib/discovery.test.ts can construct a fetch window that's
// exactly at (vs. under) this cap without hardcoding the number twice.
export const TX_HISTORY_LIMIT = 50;
// Vercel Hobby itself allows 60s, but the free cron-job.org tier that
// actually triggers this endpoint caps its own wait at 30s — that's the
// real ceiling now, not Vercel's. A batch already in flight when this
// checkpoint is crossed still has to finish before the loop actually exits,
// so budget in real margin for that plus the webhook sync/DB writes after
// the loop and Vercel's own request overhead.
const DISCOVERY_TIME_BUDGET_MS = 12_000;
// Guards snapshotWatchedWalletScores below — see its own comment for why
// this exists. Set so a skip still leaves real room for rescoreWatchedWallets
// (runs after this function returns, see the cron route) to get its own
// budget, rather than this function silently eating it all first.
const SNAPSHOT_TIME_BUDGET_CUTOFF_MS = 14_000;
// Each candidate's own Helius/FOMO/Birdeye calls are independent of every
// other candidate's — processing them one at a time was pure sequential wait
// (measured ~5-7s/candidate, mostly external API latency). Birdeye's own
// ~1 req/sec throttle already serializes the Birdeye leg of concurrent
// candidates via the shared queue in birdeyeFetch, so raising this doesn't
// risk violating that limit — it just lets the non-Birdeye legs (Helius,
// FOMO) overlap instead of blocking each other.
const CANDIDATE_CONCURRENCY = 8;

interface Candidate {
  address: string;
  source: string;
  /** Already vetted by an external, purpose-built ranking — skip our own gates. */
  trusted?: boolean;
  fomoRank?: number;
  fomoPnlUsd?: number;
  fomoVolumeUsd?: number;
}

/**
 * Birdeye's public docs don't pin down the exact field name for a wallet
 * address on these two endpoints — try the common variants and skip the row
 * if none match, rather than guessing wrong and silently corrupting data.
 */
function extractWalletAddress(row: BirdeyeTraderRow): string | undefined {
  const candidates = [row.address, row.owner, row.wallet, row.walletAddress, row.trader, row.account];
  const found = candidates.find((v): v is string => typeof v === "string" && v.length > 0);
  return found;
}

/**
 * Fetches Jupiter's trending list across a few time windows (merged and
 * deduped by mint) and applies our own liquidity/organic-score/audit bar —
 * shared by both the early-buyer and top-trader candidate collectors below
 * so each interval is only ever fetched once per discovery run.
 */
async function getFilteredTrendingMovers(): Promise<JupiterTrendingToken[]> {
  const perIntervalResults = await Promise.allSettled(
    TRENDING_INTERVALS.map((interval) => getTrendingTokens(interval, TRENDING_POOL_SIZE))
  );

  const merged = new Map<string, JupiterTrendingToken>();
  for (let i = 0; i < perIntervalResults.length; i++) {
    const result = perIntervalResults[i];
    if (result.status === "rejected") {
      console.warn(`Jupiter trending (${TRENDING_INTERVALS[i]}) lookup failed:`, (result.reason as Error).message);
      continue;
    }
    for (const token of result.value) {
      if (!merged.has(token.address)) merged.set(token.address, token);
    }
  }

  return (
    [...merged.values()]
      .filter((t) => !BASE_TOKEN_MINTS.has(t.address))
      .filter((t) => t.liquidityUsd >= MIN_TRENDING_LIQUIDITY_USD)
      // Jupiter's own bot/wash-trade estimate for this token's volume — a
      // token only trending on fake volume makes for bad candidates no
      // matter how big its price move looks.
      .filter((t) => t.organicScoreLabel !== "low")
      // A live mint/freeze authority is a classic rug vector (dev can print
      // more supply or freeze holders' accounts at will) — cheap to filter
      // out up front now that Jupiter hands us this for free.
      .filter((t) => t.mintAuthorityDisabled && t.freezeAuthorityDisabled)
      // Deliberately NOT re-sorted by raw priceChange24hPercent (the old
      // Birdeye-era approach): live-checked, and a brand-new near-zero-base
      // token can post a 16,000%+ "move" that's pure denominator noise, not
      // real momentum. Jupiter's own /toptrending order already accounts for
      // that (verified live — those exact outlier tokens sat mid-pool there,
      // not at the top) — re-sorting by our own naive % metric was actively
      // overriding a better-informed ranking with a noisier one.
      .slice(0, MAX_TRENDING_TOKENS)
  );
}

/**
 * Early buyers per trending token only hit Helius (unthrottled), so they can
 * run concurrently with each other and with the FOMO/Birdeye source fetches
 * below without violating anyone's rate limit.
 */
async function collectEarlyBuyerCandidates(movers: JupiterTrendingToken[]): Promise<Candidate[]> {
  const perToken = await Promise.allSettled(
    movers.map((token) =>
      getEarlyBuyers(token.address, { limit: EARLY_BUYERS_LOOKBACK, maxBuyers: EARLY_BUYERS_PER_TOKEN }).then(
        (buyers) => ({ token, buyers })
      )
    )
  );

  const found: Candidate[] = [];
  for (let i = 0; i < perToken.length; i++) {
    const result = perToken[i];
    if (result.status === "rejected") {
      console.warn(`Early buyer lookup failed for ${movers[i].symbol}:`, (result.reason as Error).message);
      continue;
    }
    for (const buyer of result.value.buyers) {
      found.push({ address: buyer.address, source: `early_buyer:${result.value.token.symbol}` });
    }
  }
  return found;
}

/**
 * Biggest-by-volume traders of the same trending tokens — a different tell
 * than "who bought first": a wallet building a large position confidently,
 * not necessarily the fastest one in.
 */
async function collectTopTraderCandidates(movers: JupiterTrendingToken[]): Promise<Candidate[]> {
  const subset = movers.slice(0, TOP_TRADERS_TOKEN_LIMIT);
  const perToken = await Promise.allSettled(
    subset.map((token) =>
      getTopTraders(token.address, { timeFrame: "24h", limit: TOP_TRADERS_PER_TOKEN }).then((traders) => ({
        token,
        traders,
      }))
    )
  );

  const found: Candidate[] = [];
  for (let i = 0; i < perToken.length; i++) {
    const result = perToken[i];
    if (result.status === "rejected") {
      console.warn(`Top traders lookup failed for ${subset[i].symbol}:`, (result.reason as Error).message);
      continue;
    }
    for (const trader of result.value.traders) {
      const address = extractWalletAddress(trader);
      if (address) found.push({ address, source: `top_traders:${result.value.token.symbol}` });
    }
  }
  return found;
}

/**
 * All candidate sources hit independent APIs (two FOMO leaderboard windows,
 * Birdeye gainers/losers + top-traders sharing Birdeye's own internal
 * ~1 req/sec throttle in `birdeyeFetch`, and Helius early-buyers) — running
 * them concurrently costs nothing extra against those limits and saves
 * several seconds of pure sequential wait.
 */
async function collectCandidates(): Promise<Candidate[]> {
  const candidates = new Map<string, Candidate>();
  // First source to claim an address wins — a wallet that shows up in both
  // a trusted FOMO window and a weaker, self-reconstructed source (gainers/
  // losers, early buyer, top trader) should keep its trusted rank/PnL, not
  // get silently overwritten and downgraded.
  function addIfNew(address: string, candidate: Candidate) {
    if (!candidates.has(address)) candidates.set(address, candidate);
  }

  const movers = await getFilteredTrendingMovers();

  const [leaderboard30dResult, leaderboard7dResult, gainersResult, earlyBuyerResult, topTraderResult] =
    await Promise.allSettled([
      getLeaderboard("30d", FOMO_LEADERBOARD_LIMIT),
      // A second, shorter window surfaces different traders than 30d alone
      // (a recent hot streak, not necessarily a month-long one) — same
      // trusted qualification path either way.
      getLeaderboard("7d", FOMO_LEADERBOARD_LIMIT),
      getGainersLosers({ limit: GAINERS_LOSERS_LIMIT }),
      collectEarlyBuyerCandidates(movers),
      collectTopTraderCandidates(movers),
    ]);

  // Inserted first so a full candidate budget never truncates these ahead of
  // the weaker, self-reconstructed sources below.
  for (const leaderboardResult of [leaderboard30dResult, leaderboard7dResult]) {
    if (leaderboardResult.status === "fulfilled") {
      for (const trader of leaderboardResult.value) {
        const address = trader.wallets?.solana;
        if (!address) continue; // some top FOMO traders operate EVM-only wallets
        addIfNew(address, {
          address,
          source: `fomo:${trader.handle}`,
          trusted: true,
          fomoRank: trader.rank,
          fomoPnlUsd: trader.pnlUsd,
          fomoVolumeUsd: trader.volumeUsd,
        });
      }
    } else {
      console.warn("FOMO leaderboard lookup failed:", (leaderboardResult.reason as Error).message);
    }
  }

  if (gainersResult.status === "fulfilled") {
    for (const row of gainersResult.value) {
      const address = extractWalletAddress(row);
      if (address) addIfNew(address, { address, source: "gainers_losers" });
    }
  } else {
    console.warn("Birdeye gainers/losers lookup failed:", (gainersResult.reason as Error).message);
  }

  if (earlyBuyerResult.status === "fulfilled") {
    for (const candidate of earlyBuyerResult.value) {
      addIfNew(candidate.address, candidate);
    }
  }

  if (topTraderResult.status === "fulfilled") {
    for (const candidate of topTraderResult.value) {
      addIfNew(candidate.address, candidate);
    }
  }

  return [...candidates.values()].slice(0, MAX_CANDIDATES);
}

function estimatePnl30d(transactions: ScorableTransaction[]): number {
  const cutoff = Date.now() - 30 * 86_400_000;
  let buys = 0;
  let sells = 0;
  for (const tx of transactions) {
    if (tx.occurredAt.getTime() < cutoff) continue;
    if (tx.type === "BUY") buys += tx.amountUsd;
    else sells += tx.amountUsd;
  }
  if (buys === 0) return 0;
  return Math.round(((sells - buys) / buys) * 1000) / 10;
}

interface RealPnl {
  pnl30dPercent: number;
  /** null = the Birdeye lookup itself failed (e.g. quota exhausted) — distinct
   * from a verified, genuinely-zero-or-low PnL. Callers that *remove* a
   * wallet based on this (rescoring) must not treat null as "proven bad",
   * or a Birdeye outage would silently mass-unwatch good wallets. */
  totalUsd: number | null;
}

/**
 * Birdeye's actual realized+unrealized all-time PnL — what we qualify
 * wallets against (a legendary trade is often older than 30 days, and gating
 * on a 30d number alone was silently disqualifying real gainers-losers
 * standouts). This is the one Birdeye call per untrusted candidate that
 * matters for correctness (it can't be gamed by never closing a loser, unlike
 * realized-only PnL); the 30d *display* number is a cheaper, already-on-hand
 * estimate from the Helius transactions fetched for scoring — a second
 * Birdeye call just for that display value isn't worth doubling the
 * per-candidate rate-limit cost of a discovery run.
 */
async function getRealPnl(
  address: string,
  fallbackTransactions: ScorableTransaction[]
): Promise<RealPnl> {
  const pnl30dPercent = estimatePnl30d(fallbackTransactions);
  try {
    const resAllTime = await getWalletPnlSummary(address, { duration: "all" });
    return { pnl30dPercent, totalUsd: resAllTime.summary.pnl.total_usd };
  } catch (err) {
    console.warn(`Birdeye all-time PnL lookup failed for ${address}:`, (err as Error).message);
    return { pnl30dPercent, totalUsd: null };
  }
}

/**
 * Samples a FOMO trader's recent trades to catch the same manipulation:
 * `activeCount`/`closedCount` cover the whole account (not just the sample),
 * so an unusually high share of never-closed positions is one red flag;
 * the sampled trades' unrealized losses dwarfing realized gains is another.
 * Best-effort — a failed lookup costs no penalty rather than blocking a
 * wallet that's already cleared the leaderboard bar.
 */
async function getBagHoldingPenalty(handle: string): Promise<number> {
  try {
    const { trades, activeCount, closedCount } = await getTraderTrades(handle, BAG_HOLDING_SAMPLE_SIZE);

    const totalPositions = activeCount + closedCount;
    const openRatio = totalPositions > 0 ? activeCount / totalPositions : 0;
    const openRatioPenalty =
      openRatio > BAG_HOLDING_OPEN_RATIO_FLOOR ? (openRatio - BAG_HOLDING_OPEN_RATIO_FLOOR) * 50 : 0;

    const realizedGains = trades
      .filter((t) => t.status === "closed" && t.realizedPnlUsd > 0)
      .reduce((sum, t) => sum + t.realizedPnlUsd, 0);
    const openLosses = trades
      .filter((t) => t.status === "open" && t.unrealizedPnlUsd < 0)
      .reduce((sum, t) => sum + Math.abs(t.unrealizedPnlUsd), 0);
    const lossToGainPenalty =
      realizedGains > 0 ? Math.min(20, (openLosses / realizedGains) * 10) : openLosses > 0 ? 20 : 0;

    return Math.min(BAG_HOLDING_MAX_PENALTY, openRatioPenalty + lossToGainPenalty);
  } catch (err) {
    console.warn(`FOMO trade sample failed for ${handle}:`, (err as Error).message);
    return 0;
  }
}

/**
 * Zero sells + several near-identical tiny buys + everything from the same
 * launchpad is the signature of a scripted sniper bot, not a trader with
 * conviction. Returns a score penalty (0 if the pattern isn't present) —
 * best-effort rather than a hard disqualification, since it's a heuristic
 * and a genuinely sharp degen trader who just hasn't sold yet could
 * technically brush the edges of it.
 */
export function detectSniperBotPenalty(rawTxs: HeliusEnhancedTransaction[], transactions: ScorableTransaction[]): number {
  const buys = transactions.filter((t) => t.type === "BUY");
  const sells = transactions.filter((t) => t.type === "SELL");
  if (buys.length < SNIPER_BOT_MIN_SAMPLE || sells.length > 0) return 0;

  const swapSources = rawTxs.filter((t) => t.type === "SWAP").map((t) => t.source);
  const launchpadShare =
    swapSources.length > 0
      ? swapSources.filter((s) => SNIPER_BOT_LAUNCHPAD_SOURCES.has(s)).length / swapSources.length
      : 0;
  if (launchpadShare < 0.8) return 0;

  const avgUsd = buys.reduce((sum, b) => sum + b.amountUsd, 0) / buys.length;
  if (avgUsd > SNIPER_BOT_MAX_AVG_BUY_USD) return 0;

  const variance = buys.reduce((sum, b) => sum + (b.amountUsd - avgUsd) ** 2, 0) / buys.length;
  const coefficientOfVariation = avgUsd > 0 ? Math.sqrt(variance) / avgUsd : 0;
  if (coefficientOfVariation > SNIPER_BOT_MAX_SIZE_VARIATION) return 0;

  return SNIPER_BOT_PENALTY;
}

/**
 * Flags a suspiciously regular, fast trading cadence — a script polling on a
 * timer, not a human making decisions. Independent of trade size or venue,
 * so it catches automation the sniper check can't (e.g. a bot that also
 * sells, or one that isn't launchpad-specific).
 */
export function detectHighFrequencyBotPenalty(transactions: ScorableTransaction[]): number {
  if (transactions.length < HFT_BOT_MIN_SAMPLE) return 0;

  const sorted = [...transactions].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const intervalsMinutes: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    intervalsMinutes.push((sorted[i].occurredAt.getTime() - sorted[i - 1].occurredAt.getTime()) / 60_000);
  }

  const avgInterval = intervalsMinutes.reduce((sum, v) => sum + v, 0) / intervalsMinutes.length;
  if (avgInterval <= 0 || avgInterval > HFT_BOT_MAX_AVG_INTERVAL_MINUTES) return 0;

  const variance = intervalsMinutes.reduce((sum, v) => sum + (v - avgInterval) ** 2, 0) / intervalsMinutes.length;
  const coefficientOfVariation = Math.sqrt(variance) / avgInterval;
  if (coefficientOfVariation > HFT_BOT_MAX_INTERVAL_VARIATION) return 0;

  return HFT_BOT_PENALTY;
}

/**
 * Generalized version of the sniper-bot size check: near-identical position
 * sizes with little-to-no selling, but with no dollar cap and no launchpad
 * requirement — catches templated-size bots at any trade size (e.g. a
 * copy-trader always deploying exactly 2 SOL), which the sniper check's
 * ≤$5 gate lets straight through.
 */
export function detectTemplatedSizingPenalty(transactions: ScorableTransaction[]): number {
  const buys = transactions.filter((t) => t.type === "BUY");
  const sells = transactions.filter((t) => t.type === "SELL");
  if (buys.length < TEMPLATED_SIZE_MIN_SAMPLE) return 0;

  const sellRatio = sells.length / (buys.length + sells.length);
  if (sellRatio > TEMPLATED_SIZE_MAX_SELL_RATIO) return 0;

  const avgUsd = buys.reduce((sum, b) => sum + b.amountUsd, 0) / buys.length;
  if (avgUsd <= 0) return 0;

  const variance = buys.reduce((sum, b) => sum + (b.amountUsd - avgUsd) ** 2, 0) / buys.length;
  const coefficientOfVariation = Math.sqrt(variance) / avgUsd;
  if (coefficientOfVariation > TEMPLATED_SIZE_MAX_VARIATION) return 0;

  return TEMPLATED_SIZE_PENALTY;
}

/**
 * A real insider holds a conviction position; a flip-bot buys and dumps
 * within minutes. For each token with a completed round trip, measures the
 * time from the first BUY to the first SELL that follows it — independent
 * of trade size or cadence regularity, so it catches wash/flip bots the
 * sniper and HFT checks miss.
 */
export function detectFlipBotPenalty(transactions: ScorableTransaction[]): number {
  const byToken = new Map<string, ScorableTransaction[]>();
  for (const tx of transactions) {
    const list = byToken.get(tx.tokenKey) ?? [];
    list.push(tx);
    byToken.set(tx.tokenKey, list);
  }

  const holdMinutes: number[] = [];
  for (const txs of byToken.values()) {
    const sorted = [...txs].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    const firstBuy = sorted.find((t) => t.type === "BUY");
    if (!firstBuy) continue;
    const firstSellAfter = sorted.find((t) => t.type === "SELL" && t.occurredAt > firstBuy.occurredAt);
    if (!firstSellAfter) continue;
    holdMinutes.push((firstSellAfter.occurredAt.getTime() - firstBuy.occurredAt.getTime()) / 60_000);
  }

  if (holdMinutes.length < FLIP_BOT_MIN_ROUND_TRIPS) return 0;
  const avgHoldMinutes = holdMinutes.reduce((sum, v) => sum + v, 0) / holdMinutes.length;
  if (avgHoldMinutes > FLIP_BOT_MAX_AVG_HOLD_MINUTES) return 0;

  return FLIP_BOT_PENALTY;
}

// The HFT/flip-bot checks above measure *regularity* of intervals (their
// coefficient of variation) — a genuinely sub-second bot defeats that:
// Helius timestamps are whole seconds, so with several trades per second
// most consecutive intervals compute to exactly 0, and mixing those with the
// occasional 1-second gap reads as statistically *irregular*, masking
// exactly the most extreme bot behavior. Live-observed:
// HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC scored a clean 67 with zero
// combined bot penalty despite 50 raw transactions spanning a single second
// (2700+ trades/minute) — it flooded the webhook and exhausted the DB
// connection pool before this existed. A direct, quantization-proof measure
// instead: raw trades-per-minute over the whole fetched window, regardless
// of how "regular" the spacing looks. Weighted high enough to hard-disqualify
// on its own (see BOT_PENALTY_HARD_DISQUALIFY) — unlike the other heuristics,
// there's no legitimate discretionary trading pattern that produces this.
const HIGH_VELOCITY_MIN_SAMPLE = 20;
const HIGH_VELOCITY_MAX_TRADES_PER_MINUTE = 10;
const HIGH_VELOCITY_PENALTY = 50;

export function detectHighVelocityBotPenalty(transactions: ScorableTransaction[]): number {
  if (transactions.length < HIGH_VELOCITY_MIN_SAMPLE) return 0;

  const timestamps = transactions.map((t) => t.occurredAt.getTime());
  const spanMs = Math.max(...timestamps) - Math.min(...timestamps);
  // Floor the span instead of dividing by zero — a same-millisecond burst is
  // "at least this fast", not undefined.
  const spanMinutes = Math.max(spanMs / 60_000, 1 / 60);
  const tradesPerMinute = transactions.length / spanMinutes;

  return tradesPerMinute >= HIGH_VELOCITY_MAX_TRADES_PER_MINUTE ? HIGH_VELOCITY_PENALTY : 0;
}

/**
 * Flags wallets whose entire visible history is suspiciously young for how
 * active they already are — a disposable bot/sybil wallet spun up for one
 * campaign, not an established "real user".
 */
export function detectFreshWalletPenalty(txs: HeliusEnhancedTransaction[]): number {
  // Helius returns newest-first, capped at TX_HISTORY_LIMIT. If the fetch
  // hit that cap, the oldest tx in view is just the Nth-most-recent one, not
  // the wallet's genesis — for any wallet more active than the cap, that's
  // trivially "recent" regardless of how old the wallet actually is. Age is
  // only a meaningful signal when fewer than the limit came back, i.e. we're
  // looking at the wallet's complete history. (First caught this firing on
  // ~20 of 37 already-tracked wallets purely for being active, not new —
  // never shipped past that check.)
  if (txs.length === 0 || txs.length >= TX_HISTORY_LIMIT) return 0;

  const swapCount = txs.filter((t) => t.type === "SWAP").length;
  if (swapCount < FRESH_WALLET_MIN_TX_COUNT) return 0;

  const timestamps = txs.map((t) => t.timestamp).filter((t): t is number => Number.isFinite(t));
  if (timestamps.length === 0) return 0;
  const oldestSeconds = Math.min(...timestamps);
  const ageHours = (Date.now() - oldestSeconds * 1000) / 3_600_000;
  if (ageHours > FRESH_WALLET_MAX_AGE_HOURS) return 0;

  return FRESH_WALLET_PENALTY;
}

/**
 * Best-effort "who funds this wallet" signal — scans the already-fetched
 * recent history (not a full walk-back to the wallet's genesis, which would
 * mean unbounded extra Helius calls per candidate) for the oldest visible
 * native SOL transfer INTO this wallet and returns its sender. Two
 * "independent" convergence-signal wallets sharing a funding source are a
 * red flag that they're actually the same person/bot — see lib/signals.ts.
 */
export function findFundingSource(address: string, txs: HeliusEnhancedTransaction[]): string | null {
  // Helius returns newest-first; walking from the end finds the oldest
  // inbound transfer within our fetched window first.
  for (let i = txs.length - 1; i >= 0; i--) {
    const incoming = txs[i].nativeTransfers?.find((t) => t.toUserAccount === address && t.amount > 0);
    if (incoming) return incoming.fromUserAccount;
  }
  return null;
}

/**
 * Blends a trusted (FOMO-sourced) candidate's own Solana behavior score
 * against its external leaderboard rank — see TRUSTED_BEHAVIOR_WEIGHT for
 * why this is a weighted blend, not a max(). Exported pure so the weighting
 * itself has a direct regression test, independent of the Prisma/Birdeye/
 * FOMO calls around it in processCandidate.
 */
export function blendTrustedScore(behaviorScore: number, rankScore: number): number {
  return behaviorScore * TRUSTED_BEHAVIOR_WEIGHT + rankScore * (1 - TRUSTED_BEHAVIOR_WEIGHT);
}

type QualifiedWallet = { address: string; label: string; score: number; pnl30d: number };

/** Six independent bot signatures, each targeting a different pattern a real
 * insider wouldn't show: tiny uniform launchpad snipes, suspiciously regular
 * timing, uniform position sizes at *any* size, instant flips, a
 * burner-fresh wallet already trading hard, and raw trade velocity (catches
 * the sub-second bots that defeat the timing-regularity checks via
 * timestamp quantization — see detectHighVelocityBotPenalty). Capped
 * combined so no amount of heuristic evidence alone can zero out an
 * otherwise-legitimate score. */
function computeBotPenalty(txs: HeliusEnhancedTransaction[], transactions: ScorableTransaction[]): number {
  return Math.min(
    MAX_COMBINED_BOT_PENALTY,
    detectSniperBotPenalty(txs, transactions) +
      detectHighFrequencyBotPenalty(transactions) +
      detectTemplatedSizingPenalty(transactions) +
      detectFlipBotPenalty(transactions) +
      detectFreshWalletPenalty(txs) +
      detectHighVelocityBotPenalty(transactions)
  );
}

interface HistoryEvaluation {
  score: number;
  pnl30d: number;
  qualifies: boolean;
  /** false = the Birdeye PnL lookup itself failed, so `qualifies` here rests
   * on behaviorScore alone — a "no" verdict is NOT proof the wallet is bad.
   * Callers that would *remove* a wallet on a failing verdict (rescoring)
   * must check this before treating "doesn't qualify" as "proven bad". */
  pnlVerified: boolean;
}

// A wallet with real, Birdeye-verified all-time profit qualifies even
// without a good behavior score (see BIRDEYE_PNL_QUALIFY_USD) — a legendary
// trade often looks bad on our own recent-window behavior metrics alone.
// But an arbitrage/wash-style bot can be genuinely, substantially profitable
// too — live-observed: 7a8xxAJBELDo6P9dikSYctdw6ce8F4mWr3ahcAD8Ao49 flipped
// between two paired tokens sub-second, over 1000x in 15 minutes (flooding
// the webhook and exhausting the DB connection pool), yet stayed qualified
// because this PnL path never looked at botPenalty at all. Once bot
// evidence is strong — roughly two independent corroborating signals, not
// one borderline heuristic, since MAX_COMBINED_BOT_PENALTY=70 and every
// individual penalty here is 20-40 — no amount of real profit should
// qualify it. Mirrors the equivalent floor already applied to the
// trusted/FOMO candidate path in processCandidate (see its "Trusted only
// ever meant..." comment).
export const BOT_PENALTY_HARD_DISQUALIFY = 50;

/**
 * Pure so this decision has a direct regression test, independent of the
 * Birdeye/Prisma calls around it in evaluateFromHistory.
 */
export function qualifiesByRealPnl(pnlVerified: boolean, totalUsd: number | null, botPenalty: number): boolean {
  return pnlVerified && totalUsd !== null && totalUsd >= BIRDEYE_PNL_QUALIFY_USD && botPenalty < BOT_PENALTY_HARD_DISQUALIFY;
}

/**
 * Independently re-derives a score/PnL/qualification verdict from a
 * wallet's own current on-chain behavior — never trusts an external rank or
 * a wallet's own history of having once qualified. Shared by the untrusted
 * discovery path below and the periodic re-scoring pass (lib/rescoring.ts,
 * via refreshWalletFromChain), so both apply identical standards.
 */
async function evaluateFromHistory(
  address: string,
  behaviorScore: number,
  botPenalty: number,
  transactions: ScorableTransaction[]
): Promise<HistoryEvaluation> {
  const score = Math.max(0, behaviorScore - botPenalty);
  const realPnl = await getRealPnl(address, transactions);
  const pnlVerified = realPnl.totalUsd !== null;
  const qualifiesByPnl = qualifiesByRealPnl(pnlVerified, realPnl.totalUsd, botPenalty);
  const qualifies = score >= SMART_SCORE_THRESHOLD || qualifiesByPnl;
  return { score, pnl30d: realPnl.pnl30dPercent, qualifies, pnlVerified };
}

/**
 * Fetches a wallet's current Helius history and fully re-evaluates it from
 * scratch — the one entry point lib/rescoring.ts needs to periodically
 * re-validate already-tracked wallets. `hasActivity: false` means the fetch
 * window had no scorable trades at all; the caller should defer to the
 * dedicated inactivity pruner (pruneStaleWallets) rather than double-judging
 * that case here.
 */
export async function refreshWalletFromChain(address: string): Promise<
  | (HistoryEvaluation & { fundingSource: string | null; hasActivity: true })
  | { hasActivity: false }
  | null
> {
  let txs: HeliusEnhancedTransaction[];
  try {
    txs = await getEnhancedTransactions(address, { limit: TX_HISTORY_LIMIT });
  } catch (err) {
    console.warn(`Helius history fetch failed for ${address}:`, (err as Error).message);
    return null;
  }

  const transactions = await toScorableTransactions(address, txs);
  if (transactions.length === 0) return { hasActivity: false };

  const { score: behaviorScore } = calculateSmartScore({ transactions });
  const botPenalty = computeBotPenalty(txs, transactions);
  const evaluation = await evaluateFromHistory(address, behaviorScore, botPenalty, transactions);
  const fundingSource = findFundingSource(address, txs);

  return { ...evaluation, fundingSource, hasActivity: true };
}

/** One candidate's full qualify-and-persist pipeline — independent of every
 * other candidate, so the caller can run a batch of these concurrently. */
async function processCandidate(candidate: Candidate): Promise<QualifiedWallet | null> {
  let txs: HeliusEnhancedTransaction[];
  try {
    txs = await getEnhancedTransactions(candidate.address, { limit: TX_HISTORY_LIMIT });
  } catch (err) {
    console.warn(`Helius history fetch failed for ${candidate.address}:`, (err as Error).message);
    return null;
  }

  const transactions = await toScorableTransactions(candidate.address, txs);
  if (transactions.length === 0) return null;

  const { score: behaviorScore } = calculateSmartScore({ transactions });
  const botPenalty = computeBotPenalty(txs, transactions);

  let score = behaviorScore;
  let pnl30d: number;
  if (candidate.trusted) {
    // Blended against behaviorScore (see TRUSTED_BEHAVIOR_WEIGHT), not
    // max()'d — a real leaderboard rank (1st ≈ 99, 25th ≈ 70) is a
    // meaningful nudge, but can no longer unconditionally float a wallet
    // that's currently behaving/trading badly on Solana up to a 70+ score.
    // The bot penalty is still subtracted after the blend, same as before,
    // so an obvious bot pattern we can see ourselves still pulls a high
    // external rank down.
    const rankScore = candidate.fomoRank
      ? Math.max(70, 100 - ((candidate.fomoRank - 1) * 30) / FOMO_LEADERBOARD_LIMIT)
      : 70;
    const handle = candidate.source.split(":")[1];
    const bagPenalty = await getBagHoldingPenalty(handle);
    score = Math.max(0, blendTrustedScore(behaviorScore, rankScore) - bagPenalty - botPenalty);
    // "Trusted" only ever meant "skip our *qualification* gates, not our
    // *penalties*" — without this, a heavily bot-penalized wallet still had
    // no floor to actually fail, so a confirmed sniper bot (e.g.
    // 5FGoPPj1nL8LCnfVnpTmreqQtqLuMXXAwuS1uahMrp8V, manually unwatched after
    // being caught) kept getting silently re-upserted to isWatched:true
    // every time it resurfaced on the FOMO leaderboard, since the penalty
    // lowered its displayed score but never blocked the upsert itself.
    if (score < SMART_SCORE_THRESHOLD) return null;
    pnl30d = candidate.fomoVolumeUsd
      ? Math.round((candidate.fomoPnlUsd! / candidate.fomoVolumeUsd) * 1000) / 10
      : 0;
  } else {
    const evaluation = await evaluateFromHistory(candidate.address, behaviorScore, botPenalty, transactions);
    if (!evaluation.qualifies) return null;
    score = evaluation.score;
    pnl30d = evaluation.pnl30d;
  }

  const label = candidate.trusted
    ? `FOMO Top Trader (${candidate.source.split(":")[1]})`
    : `Smart Money (${candidate.source})`;
  const fundingSource = findFundingSource(candidate.address, txs);

  // Checked before the upsert specifically to know whether this is a truly
  // new wallet — needed to record exactly one WalletDiscoveryOutcome per
  // wallet (at first discovery only), not on every later re-qualification.
  const existedBefore = await prisma.wallet.findUnique({
    where: { address: candidate.address },
    select: { id: true },
  });

  const wallet = await prisma.wallet.upsert({
    where: { address: candidate.address },
    update: { smartScore: Math.round(score), pnl30d, isWatched: true, fundingSource },
    create: {
      address: candidate.address,
      label,
      tag: "Auto-discovered",
      smartScore: Math.round(score),
      pnl30d,
      isWatched: true,
      fundingSource,
    },
  });

  if (!existedBefore) {
    await prisma.walletDiscoveryOutcome.create({
      data: {
        walletId: wallet.id,
        address: wallet.address,
        // Coarse discovery-channel bucket ("fomo", "gainers_losers",
        // "early_buyer", "top_traders") for comparing which channel
        // produces more durable wallets — see lib/wallet-performance.ts.
        source: candidate.trusted ? "fomo" : candidate.source.split(":")[0],
        initialScore: Math.round(score),
        initialPnl30d: pnl30d,
      },
    });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  await prisma.scoreSnapshot.upsert({
    where: { walletId_date: { walletId: wallet.id, date: today } },
    update: { score: Math.round(score) },
    create: { walletId: wallet.id, score: Math.round(score), date: today },
  });

  return { address: candidate.address, label, score: Math.round(score), pnl30d };
}

// A single candidate can legitimately chain a slow Helius retry (~21s worst)
// and a slow FOMO trades lookup (~11s worst) *sequentially* — over 30s for
// just one candidate, which blows the whole batch (and the cron's 30s
// ceiling) regardless of how tight DISCOVERY_TIME_BUDGET_MS is. Racing each
// candidate against its own hard deadline bounds a batch's worst case to
// this value no matter how slow the external APIs get; an abandoned
// candidate's promise keeps running in the background (no real JS
// cancellation without threading an AbortController through every call) but
// no longer holds up the response.
const PER_CANDIDATE_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

export interface DiscoveryResult {
  candidatesScanned: number;
  qualified: QualifiedWallet[];
  pruned: PruneResult;
  webhookSync: Awaited<ReturnType<typeof syncHeliusWebhook>>;
}

export async function discoverSmartMoneyWallets(): Promise<DiscoveryResult> {
  const startedAt = Date.now();
  const stalePruned = await pruneStaleWallets();
  const highVolumePruned = await pruneHighVolumeWallets();
  const pruned: PruneResult = {
    prunedCount: stalePruned.prunedCount + highVolumePruned.prunedCount,
    prunedAddresses: [...stalePruned.prunedAddresses, ...highVolumePruned.prunedAddresses],
  };
  const candidates = await collectCandidates();
  const qualified: QualifiedWallet[] = [];
  let scanned = 0;

  for (let i = 0; i < candidates.length; i += CANDIDATE_CONCURRENCY) {
    if (Date.now() - startedAt > DISCOVERY_TIME_BUDGET_MS) {
      console.warn(
        `Discovery time budget hit — stopping after ${scanned}/${candidates.length} candidates ` +
          `(runs hourly, remainder gets picked up on a later pass).`
      );
      break;
    }

    const batch = candidates.slice(i, i + CANDIDATE_CONCURRENCY);
    scanned += batch.length;
    const results = await Promise.all(batch.map((c) => withTimeout(processCandidate(c), PER_CANDIDATE_TIMEOUT_MS)));
    for (const result of results) if (result) qualified.push(result);
  }

  // Independent of everything above succeeding — a Helius outage here must
  // not swallow this run's qualified/pruned results or block the route's
  // subsequent rescoreWatchedWallets call, which is exactly the mechanism
  // that un-watches the bot wallets burning Helius credits in the first
  // place (see pruneHighVolumeWallets above for the immediate, Helius-free
  // half of that fix).
  let webhookSync: Awaited<ReturnType<typeof syncHeliusWebhook>>;
  try {
    webhookSync = await syncHeliusWebhook();
  } catch (err) {
    console.warn("syncHeliusWebhook failed:", (err as Error).message);
    webhookSync = { status: "skipped", reason: (err as Error).message };
  }

  // Skipped rather than run unconditionally once the watched-wallet pool got
  // big enough to make this genuinely expensive (live-observed: with 80+
  // watched wallets, this — plus everything above — regularly ate the
  // *entire* cron's time budget, leaving rescoreWatchedWallets 0ms to work
  // with every single tick, which is how several wallets sat un-rescored for
  // hours and drifted into obvious bot behavior before ever being re-checked).
  // A skip just means today's snapshot lands on a later tick instead — no
  // data lost, unlike a starved rescore pass.
  if (Date.now() - startedAt < SNAPSHOT_TIME_BUDGET_CUTOFF_MS) {
    await snapshotWatchedWalletScores();
  } else {
    console.warn("Skipping score snapshot this tick — already over budget, deferring to the next run.");
  }

  console.log(
    `Discovery finished in ${Date.now() - startedAt}ms — ${pruned.prunedCount} pruned, ` +
      `${scanned}/${candidates.length} candidates scanned, ${qualified.length} qualified.`
  );

  return { candidatesScanned: scanned, qualified, pruned, webhookSync };
}

/**
 * processCandidate() only writes a ScoreSnapshot for wallets that resurface
 * as a discovery candidate on this run — the vast majority of already-
 * tracked wallets don't, since discovery only samples a few sources per run.
 * Left alone, their WalletList sparkline would go flat after their last
 * resurfacing instead of reflecting one point per day. Runs once per
 * discovery pass (hourly) across all watched wallets. Was once cheap enough
 * to run unconditionally regardless of wallet count — no longer true once
 * the watched pool reached the dozens (each is its own DB round trip); see
 * SNAPSHOT_TIME_BUDGET_CUTOFF_MS at the call site for how that's now guarded.
 */
async function snapshotWatchedWalletScores(): Promise<void> {
  const wallets = await prisma.wallet.findMany({
    where: { isWatched: true },
    select: { id: true, smartScore: true },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await Promise.all(
    wallets.map((w) =>
      prisma.scoreSnapshot.upsert({
        where: { walletId_date: { walletId: w.id, date: today } },
        update: { score: w.smartScore },
        create: { walletId: w.id, score: w.smartScore, date: today },
      })
    )
  );
}
