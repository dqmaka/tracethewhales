const JUPITER_API_BASE = "https://lite-api.jup.ag";

/**
 * Free, no-API-key replacement for Birdeye's token_trending endpoint (which
 * shares Birdeye's ~1 req/sec quota with everything else and has been
 * exhausted once already this project). Verified live: no auth required,
 * returns up to 50 tokens with real volume/liquidity/organic-trading data —
 * richer than Birdeye's trending list, since Jupiter also scores how much of
 * the volume looks like genuine (vs. wash-traded/bot) activity.
 *
 * DexScreener was considered first (it's already our overview/liquidity
 * source elsewhere) but has no chain-wide trending endpoint at all — its
 * public API only supports address/pair lookups and a name search, both
 * confirmed live to return the wrong thing for "what's trending on Solana
 * right now" (search matches token *names*, not a chain filter).
 */
export interface JupiterTrendingToken {
  address: string;
  symbol: string;
  name: string;
  liquidityUsd: number;
  volume24hUsd: number;
  priceChange24hPercent: number | null;
  /** Jupiter's own 0-100 estimate of how much trading volume looks organic
   * rather than wash-traded/bot-driven — a token trending purely on bot
   * volume makes for bad "early buyer" candidates regardless of price move. */
  organicScore: number;
  organicScoreLabel: "low" | "medium" | "high" | string;
  mintAuthorityDisabled: boolean;
  freezeAuthorityDisabled: boolean;
}

interface JupiterTokenV2Response {
  id: string;
  symbol: string;
  name: string;
  liquidity?: number;
  stats24h?: { priceChange?: number; volumeChange?: number; buyVolume?: number; sellVolume?: number };
  organicScore?: number;
  organicScoreLabel?: string;
  audit?: { mintAuthorityDisabled?: boolean; freezeAuthorityDisabled?: boolean };
}

/**
 * `interval` matches the stats window Jupiter ranks by; "24h" is the closest
 * analogue to Birdeye's old volumeUSD-sorted trending list.
 */
export async function getTrendingTokens(
  interval: "5m" | "1h" | "6h" | "24h" = "24h",
  limit = 20
): Promise<JupiterTrendingToken[]> {
  const res = await fetch(`${JUPITER_API_BASE}/tokens/v2/toptrending/${interval}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Jupiter trending request failed: ${res.status} ${res.statusText}`);
  }
  const json: JupiterTokenV2Response[] = await res.json();

  return json.slice(0, limit).map((t) => ({
    address: t.id,
    symbol: t.symbol,
    name: t.name,
    liquidityUsd: t.liquidity ?? 0,
    volume24hUsd: (t.stats24h?.buyVolume ?? 0) + (t.stats24h?.sellVolume ?? 0),
    priceChange24hPercent: t.stats24h?.priceChange ?? null,
    organicScore: t.organicScore ?? 0,
    organicScoreLabel: (t.organicScoreLabel as JupiterTrendingToken["organicScoreLabel"]) ?? "low",
    mintAuthorityDisabled: t.audit?.mintAuthorityDisabled ?? false,
    freezeAuthorityDisabled: t.audit?.freezeAuthorityDisabled ?? false,
  }));
}
