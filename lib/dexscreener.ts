const DEXSCREENER_API_BASE = "https://api.dexscreener.com";

export interface DexScreenerTokenOverview {
  priceUsd: number;
  liquidityUsd: number;
  marketCapUsd: number;
  volume24hUsd: number;
  symbol: string;
  name: string;
}

interface DexScreenerPair {
  baseToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  marketCap?: number;
  fdv?: number;
  volume?: { h24?: number };
}

/**
 * Free, no-API-key alternative to Birdeye's token_overview — used for the
 * signals pipeline's liquidity/price/volume checks, which run far more often
 * (every candidate, every push-cron tick) than Birdeye's quota comfortably
 * supports (we've hit "compute units usage limit exceeded" from this exact
 * usage pattern). Picks the highest-liquidity pair when a token trades
 * across multiple pools, since that's the most representative price/depth.
 *
 * Not a full Birdeye replacement: no historical OHLC time series (the price
 * chart stays on Birdeye, called far less often — once per page view, not
 * once per signal check) and no curated trending/gainers-losers rankings.
 */
export async function getTokenOverview(mint: string): Promise<DexScreenerTokenOverview> {
  const res = await fetch(`${DEXSCREENER_API_BASE}/latest/dex/tokens/${mint}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`DexScreener request failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const pairs: DexScreenerPair[] = json.pairs ?? [];
  if (pairs.length === 0) {
    throw new Error(`No DexScreener pairs found for ${mint}`);
  }

  const best = pairs.reduce((a, b) => ((b.liquidity?.usd ?? 0) > (a.liquidity?.usd ?? 0) ? b : a));

  return {
    priceUsd: Number(best.priceUsd ?? 0),
    liquidityUsd: best.liquidity?.usd ?? 0,
    marketCapUsd: best.marketCap ?? best.fdv ?? 0,
    volume24hUsd: best.volume?.h24 ?? 0,
    symbol: best.baseToken.symbol,
    name: best.baseToken.name,
  };
}
