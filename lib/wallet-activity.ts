import { getTokenOverview } from "./dexscreener";
import { getEnhancedTransactions, type HeliusEnhancedTransaction } from "./helius";
import { calculateSmartScore, type ScorableTransaction, type ScorableTxType, type SmartScoreBreakdown } from "./scoring";

const WSOL_MINT = "So11111111111111111111111111111111111111112";
const LAMPORTS_PER_SOL = 1_000_000_000;

// A multi-hop Jupiter route through an intermediate mint (or the trader's
// own wallet mid-route) rarely nets to *exactly* zero after in/out transfers
// are summed — on-chain rounding across hops routinely leaves a tiny residual
// (observed live: amountUsd values as low as 1e-15) that isn't a real trade,
// just routing noise. Priced and stored anyway, it silently corrupts every
// consumer of amountUsd: 30d PnL (a near-zero denominator in a ratio blows up
// to an astronomical %), the smart score's size-consistency component, bot
// heuristics, and the "unusual movement" alert baseline (a wallet's own
// average trade size gets dragged toward $0, so any normal-sized trade after
// it falsely looks like a huge multiple of "normal"). Anything below this
// floor is economically meaningless at the scale this app cares about
// (LARGE_TRANSACTION_USD_THRESHOLD alone is $2,000) and is dropped instead of
// priced.
const MIN_MEANINGFUL_TRADE_USD = 0.01;

// A warm serverless instance can live for hours — without a TTL, the first
// price ever fetched (e.g. SOL's, on the very first request it handles)
// would silently keep pricing every trade for that instance's entire
// lifetime, drifting further from reality the longer it stays warm.
const PRICE_CACHE_TTL_MS = 5 * 60_000;
// A failed lookup gets a much shorter TTL than a real price — caching a
// transient miss for the full 5 minutes would keep every trade's amountUsd
// pinned at $0 for that whole window instead of retrying soon.
const PRICE_CACHE_FAILURE_TTL_MS = 20_000;
const priceCache = new Map<string, { value: number; fetchedAt: number; ttl: number }>();

/**
 * DexScreener (free, no quota) rather than Birdeye's own price endpoint —
 * this is the highest-frequency price consumer in the app (every live
 * wallet-activity trade needs the SOL price), and it silently collapsing
 * every trade's amountUsd to $0 was traced back to Birdeye's "Compute units
 * usage limit exceeded" quota error, caught here and cached as a 0. Moving
 * this call off Birdeye is the actual fix, not just a cache-duration tweak.
 */
async function getCachedPrice(mint: string): Promise<number> {
  const cached = priceCache.get(mint);
  if (cached && Date.now() - cached.fetchedAt < cached.ttl) return cached.value;
  try {
    const overview = await getTokenOverview(mint);
    priceCache.set(mint, { value: overview.priceUsd, fetchedAt: Date.now(), ttl: PRICE_CACHE_TTL_MS });
    return overview.priceUsd;
  } catch {
    priceCache.set(mint, { value: 0, fetchedAt: Date.now(), ttl: PRICE_CACHE_FAILURE_TTL_MS });
    return 0;
  }
}

/**
 * Most Solana swaps are priced in SOL, and Birdeye reliably has a SOL price —
 * unlike the meme-coin side of the trade, which is often too new or illiquid
 * to be priced at all (a fresh pump.fun token, for instance), silently
 * collapsing the trade's value to $0. Reading the SOL leg of the *same*
 * transaction avoids needing a price for the target token at all.
 *
 * Doesn't filter by which account the SOL moved to/from: pump.fun buys are
 * routinely executed through a bundler/fee-payer that never touches the
 * buyer's own wallet address, so "find a transfer involving walletAddress"
 * finds nothing even though the trade clearly happened. Taking the single
 * largest SOL movement in the transaction instead is a robust proxy for the
 * trade size — everything smaller is priority fees, referral cuts, rent.
 */
function findSolLegAmount(tx: HeliusEnhancedTransaction): number | null {
  const amounts = [
    ...(tx.tokenTransfers ?? []).filter((t) => t.mint === WSOL_MINT).map((t) => t.tokenAmount),
    ...(tx.nativeTransfers ?? []).map((t) => t.amount / LAMPORTS_PER_SOL),
  ];
  return amounts.length > 0 ? Math.max(...amounts) : null;
}

/**
 * Turns a wallet's raw Helius swap history into scorable trades. Values each
 * trade via its SOL leg where one exists (see findSolLegAmount); only falls
 * back to pricing the traded token directly for non-SOL pairs. Uses the
 * *current* SOL/token price as a stand-in for the price at trade time
 * (Birdeye's historical price endpoint would mean one extra call per trade,
 * which doesn't scale across a whole discovery batch) — good enough for a
 * relative smart-score ranking, not for precise historical PnL.
 *
 * Nets transfers per mint *within one transaction* before scoring. Jupiter's
 * router sometimes moves a token through the trader's own wallet mid-route
 * (buy USDC→SOL→USDC back in one tx) — Helius reports that as the wallet
 * both receiving and sending the same mint, which naively looks like a
 * same-block round-trip trade. It isn't one: net exposure is ~zero, it's a
 * routing artifact (or same-tx arbitrage), not a directional bet. Counting
 * it as a completed BUY+SELL was mechanically maxing out roundTripRate for
 * bots that never actually hold a directional position.
 */
export async function toScorableTransactions(
  walletAddress: string,
  txs: HeliusEnhancedTransaction[]
): Promise<ScorableTransaction[]> {
  const scorable: ScorableTransaction[] = [];

  for (const tx of txs) {
    if (tx.type !== "SWAP" || !Number.isFinite(tx.timestamp)) continue;

    const solLegAmount = findSolLegAmount(tx);
    const solLegUsd = solLegAmount !== null ? solLegAmount * (await getCachedPrice(WSOL_MINT)) : null;

    const netByMint = new Map<string, number>();
    for (const transfer of tx.tokenTransfers ?? []) {
      if (transfer.tokenAmount <= 0 || transfer.mint === WSOL_MINT) continue;
      const signed =
        transfer.toUserAccount === walletAddress
          ? transfer.tokenAmount
          : transfer.fromUserAccount === walletAddress
            ? -transfer.tokenAmount
            : 0;
      if (signed === 0) continue;
      netByMint.set(transfer.mint, (netByMint.get(transfer.mint) ?? 0) + signed);
    }

    for (const [mint, netAmount] of netByMint) {
      if (netAmount === 0) continue;

      const type: ScorableTxType = netAmount > 0 ? "BUY" : "SELL";
      const amountUsd = solLegUsd ?? Math.abs(netAmount) * (await getCachedPrice(mint));
      if (amountUsd < MIN_MEANINGFUL_TRADE_USD) continue; // routing dust, not a real trade — see MIN_MEANINGFUL_TRADE_USD

      scorable.push({
        tokenKey: mint,
        amountUsd,
        type,
        occurredAt: new Date(tx.timestamp * 1000),
        signature: tx.signature,
      });
    }
  }

  return scorable;
}

export interface NetWalletTrade {
  walletAddress: string;
  mint: string;
  amountUsd: number;
  type: ScorableTxType;
  occurredAt: Date;
  signature: string;
}

/**
 * Same net-per-mint logic as toScorableTransactions, but for the webhook
 * path: a single incoming transaction can involve *several* of our tracked
 * wallets at once (e.g. two tracked whales trading with each other), and
 * unlike the wallet-detail page we don't already know which address to look
 * at — Helius only guarantees *some* registered address appears somewhere
 * in tokenTransfers, not that it's the feePayer (pump.fun buys routed
 * through a bundler routinely aren't). This checks every transfer's actual
 * participants against the tracked set instead of trusting feePayer.
 */
export async function extractNetWalletTrades(
  tx: HeliusEnhancedTransaction,
  trackedAddresses: Set<string>
): Promise<NetWalletTrade[]> {
  if (tx.type !== "SWAP" || !Number.isFinite(tx.timestamp)) return [];

  const solLegAmount = findSolLegAmount(tx);
  const solLegUsd = solLegAmount !== null ? solLegAmount * (await getCachedPrice(WSOL_MINT)) : null;

  const netByKey = new Map<string, { walletAddress: string; mint: string; net: number }>();
  for (const transfer of tx.tokenTransfers ?? []) {
    if (transfer.tokenAmount <= 0 || transfer.mint === WSOL_MINT) continue;

    if (transfer.toUserAccount && trackedAddresses.has(transfer.toUserAccount)) {
      const key = `${transfer.toUserAccount}|${transfer.mint}`;
      const entry = netByKey.get(key) ?? { walletAddress: transfer.toUserAccount, mint: transfer.mint, net: 0 };
      entry.net += transfer.tokenAmount;
      netByKey.set(key, entry);
    }
    if (transfer.fromUserAccount && trackedAddresses.has(transfer.fromUserAccount)) {
      const key = `${transfer.fromUserAccount}|${transfer.mint}`;
      const entry = netByKey.get(key) ?? { walletAddress: transfer.fromUserAccount, mint: transfer.mint, net: 0 };
      entry.net -= transfer.tokenAmount;
      netByKey.set(key, entry);
    }
  }

  const trades: NetWalletTrade[] = [];
  for (const { walletAddress, mint, net } of netByKey.values()) {
    if (net === 0) continue;
    const amountUsd = solLegUsd ?? Math.abs(net) * (await getCachedPrice(mint));
    if (amountUsd < MIN_MEANINGFUL_TRADE_USD) continue; // routing dust, not a real trade — see MIN_MEANINGFUL_TRADE_USD
    trades.push({
      walletAddress,
      mint,
      amountUsd,
      type: net > 0 ? "BUY" : "SELL",
      occurredAt: new Date(tx.timestamp * 1000),
      signature: tx.signature,
    });
  }
  return trades;
}

export interface LiveWalletActivity {
  transactions: ScorableTransaction[];
  breakdown: SmartScoreBreakdown;
}

/** Fetches a wallet's recent Solana swap history and scores it live — used
 * by the wallet detail page to show real, current activity even for wallets
 * whose own Transaction rows are still empty (no webhook activity yet). */
export async function getLiveWalletActivity(
  address: string,
  limit = 50
): Promise<LiveWalletActivity> {
  const txs = await getEnhancedTransactions(address, { limit });
  const transactions = await toScorableTransactions(address, txs);
  const breakdown = calculateSmartScore({ transactions });
  return { transactions, breakdown };
}
