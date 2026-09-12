// Free, keyless replacement for Birdeye's getHistoricalPrice — the last
// Birdeye dependency in the chart/signal-trigger-price path, and the one
// with no DexScreener equivalent (DexScreener only exposes current price,
// not history). GeckoTerminal (CoinGecko's DEX aggregator) has no per-account
// quota to exhaust, unlike Birdeye — just a public rate limit, handled by the
// same throttle-queue pattern as lib/birdeye.ts.
const GECKOTERMINAL_API_BASE = "https://api.geckoterminal.com/api/v2";
const NETWORK = "solana";

// GeckoTerminal's public (keyless) tier is commonly documented around
// 30 calls/minute — 500ms was tuned optimistically and started 429ing live
// once a single cron run enriches several signals back-to-back (2 calls
// each: pool lookup + OHLCV). ~2.1s keeps sustained throughput safely under
// that budget.
const MIN_INTERVAL_MS = 2_100;
let lastRequestAt = 0;
// Same concurrency-safe chaining as lib/birdeye.ts — a bare "read
// lastRequestAt, then wait" check races when calls land concurrently.
let queue: Promise<unknown> = Promise.resolve();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttledFetch(url: string): Promise<Response> {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();

  let res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (res.status === 429) {
    // Respect a Retry-After header when GeckoTerminal sends one, rather than
    // guessing — falls back to a generous fixed backoff otherwise.
    const retryAfterHeader = Number(res.headers.get("retry-after"));
    const backoffMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader * 1000 : MIN_INTERVAL_MS * 2;
    await sleep(backoffMs);
    lastRequestAt = Date.now();
    res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  }
  return res;
}

function geckoTerminalFetch(url: string): Promise<Response> {
  const result = queue.then(() => throttledFetch(url));
  queue = result.catch(() => {});
  return result;
}

interface GeckoTerminalPool {
  attributes: {
    address: string;
    reserve_in_usd?: string;
  };
}

/**
 * OHLCV is pool-scoped, not token-scoped — GeckoTerminal has no single
 * "the" price series for a token that trades on multiple pools/DEXs, so the
 * most liquid pool has to be picked first. Sorted by reserve_in_usd
 * ourselves rather than trusting the endpoint's own (undocumented) default
 * order. Returns null for a token with no indexed pools (too new/illiquid
 * for GeckoTerminal to have picked up yet) — callers treat that the same as
 * "no price history available".
 */
async function getPrimaryPoolAddress(tokenAddress: string): Promise<string | null> {
  const res = await geckoTerminalFetch(
    `${GECKOTERMINAL_API_BASE}/networks/${NETWORK}/tokens/${tokenAddress}/pools?page=1`
  );
  // A token GeckoTerminal hasn't indexed at all (too new/obscure) 404s here
  // the same way an indexed-but-poolless token would return an empty list
  // below — both mean "no price history available", not a real failure.
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GeckoTerminal pools request failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const pools: GeckoTerminalPool[] = json.data ?? [];
  if (pools.length === 0) return null;

  const sorted = [...pools].sort(
    (a, b) => Number(b.attributes.reserve_in_usd ?? 0) - Number(a.attributes.reserve_in_usd ?? 0)
  );
  return sorted[0].attributes.address;
}

export interface PricePoint {
  unixTime: number;
  value: number;
}

const TIMEFRAME_BY_TYPE: Record<string, { timeframe: "minute" | "hour" | "day"; aggregate: string }> = {
  "1m": { timeframe: "minute", aggregate: "1" },
  "5m": { timeframe: "minute", aggregate: "5" },
  "1H": { timeframe: "hour", aggregate: "1" },
  "1D": { timeframe: "day", aggregate: "1" },
};

/**
 * Drop-in replacement for Birdeye's getHistoricalPrice — same
 * {from, to, type} -> PricePoint[] shape (unixTime/value), just backed by
 * GeckoTerminal's free OHLCV endpoint instead. `value` is each candle's
 * close price in USD; `from`/`to` are unix seconds, matching every existing
 * caller.
 */
export async function getHistoricalPrice(
  tokenAddress: string,
  options: { from: number; to: number; type?: "1m" | "5m" | "1H" | "1D" }
): Promise<PricePoint[]> {
  const poolAddress = await getPrimaryPoolAddress(tokenAddress);
  if (!poolAddress) return [];

  const { timeframe, aggregate } = TIMEFRAME_BY_TYPE[options.type ?? "1H"];
  const params = new URLSearchParams({
    aggregate,
    before_timestamp: String(options.to),
    limit: "1000",
    currency: "usd",
  });

  const res = await geckoTerminalFetch(
    `${GECKOTERMINAL_API_BASE}/networks/${NETWORK}/pools/${poolAddress}/ohlcv/${timeframe}?${params.toString()}`
  );
  if (!res.ok) {
    throw new Error(`GeckoTerminal OHLCV request failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const ohlcvList: [number, number, number, number, number, number][] = json.data?.attributes?.ohlcv_list ?? [];

  return ohlcvList
    .filter(([ts]) => ts >= options.from)
    .map(([ts, , , , close]) => ({ unixTime: ts, value: close }))
    .sort((a, b) => a.unixTime - b.unixTime);
}
