import { sanitizeSecret } from "./sanitize";

const BIRDEYE_API_BASE = "https://public-api.birdeye.so";

function getHeaders(chain: string = "solana"): HeadersInit {
  const key = process.env.BIRDEYE_API_KEY;
  if (!key) throw new Error("BIRDEYE_API_KEY is not set");
  return {
    "X-API-KEY": sanitizeSecret(key),
    "x-chain": chain,
    accept: "application/json",
  };
}

const MIN_INTERVAL_MS = 1100;
let lastRequestAt = 0;
// Callers (e.g. discovery.ts) now fire multiple Birdeye requests concurrently
// — a bare "read lastRequestAt, then wait" check races when two calls land
// before either has updated it, letting both through almost simultaneously.
// Chaining every call onto this queue serializes them in call order so the
// ~1 req/sec spacing actually holds regardless of caller concurrency.
let queue: Promise<unknown> = Promise.resolve();

// Circuit breaker for Birdeye's account-level quota (distinct from the
// per-request 429 rate limit above): once we've seen "Compute units usage
// limit exceeded" once, every other Birdeye call this same run would fail
// the exact same way — but without this, each one still pays the full
// ~1.1s throttle wait before finding that out, wasting real time out of the
// discovery cron's tight budget (observed live: a run hitting this on
// gainers_losers + 2 top_traders calls wasted ~3.3s finding out three times
// what the first failure already told us). Cools down after a few minutes
// rather than staying open forever, since the quota does eventually reset.
const QUOTA_EXHAUSTED_COOLDOWN_MS = 5 * 60_000;
let quotaExhaustedAt: number | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttledFetch(url: string): Promise<Response> {
  if (quotaExhaustedAt !== null && Date.now() - quotaExhaustedAt < QUOTA_EXHAUSTED_COOLDOWN_MS) {
    throw new Error("Birdeye quota exhausted (circuit open) — skipping call until the cooldown clears");
  }

  const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();

  // Bounds worst-case latency so one stalled request can't blow the
  // discovery cron's overall time budget (see DISCOVERY_TIME_BUDGET_MS).
  let res = await fetch(url, { headers: getHeaders(), signal: AbortSignal.timeout(10_000) });
  if (res.status === 429) {
    await sleep(MIN_INTERVAL_MS * 2);
    lastRequestAt = Date.now();
    res = await fetch(url, { headers: getHeaders(), signal: AbortSignal.timeout(10_000) });
  }

  if (res.status === 400) {
    const body = await res
      .clone()
      .text()
      .catch(() => "");
    if (body.includes("Compute units usage limit exceeded")) {
      quotaExhaustedAt = Date.now();
      console.warn("Birdeye quota exhausted — short-circuiting further Birdeye calls for the next 5 minutes");
    }
  } else if (res.ok) {
    quotaExhaustedAt = null; // a real success clears any previously-tripped breaker
  }

  return res;
}

/**
 * Birdeye's plan tiers rate-limit around ~1 req/sec — space requests out and
 * retry once on a 429 instead of failing a whole discovery batch over it.
 */
function birdeyeFetch(url: string): Promise<Response> {
  const result = queue.then(() => throttledFetch(url));
  queue = result.catch(() => {});
  return result;
}

export interface BirdeyeTraderRow {
  owner?: string;
  address?: string;
  [key: string]: unknown;
}

export async function getTopTraders(
  tokenAddress: string,
  options?: { timeFrame?: string; limit?: number }
): Promise<BirdeyeTraderRow[]> {
  const params = new URLSearchParams({
    address: tokenAddress,
    time_frame: options?.timeFrame ?? "24h",
    sort_type: "desc",
    sort_by: "volume",
    limit: String(options?.limit ?? 10),
  });
  const res = await birdeyeFetch(`${BIRDEYE_API_BASE}/defi/v2/tokens/top_traders?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Birdeye top traders request failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  return json.data?.items ?? json.data ?? [];
}

export async function getGainersLosers(options?: {
  type?: "yesterday" | "today" | "1W" | "30d" | "90d";
  limit?: number;
}): Promise<BirdeyeTraderRow[]> {
  const params = new URLSearchParams({
    type: options?.type ?? "1W",
    sort_by: "PnL",
    sort_type: "desc",
    limit: String(options?.limit ?? 10),
  });
  const res = await birdeyeFetch(`${BIRDEYE_API_BASE}/trader/gainers-losers?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Birdeye gainers/losers request failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  return json.data?.items ?? json.data ?? [];
}

export interface BirdeyeWalletPnlSummary {
  summary: {
    counts: {
      total_buy: number;
      total_sell: number;
      total_trade: number;
      total_win: number;
      win_rate: number;
    };
    pnl: {
      realized_profit_usd: number;
      realized_profit_percent: number;
      unrealized_usd: number;
      total_usd: number;
    };
    cashflow_usd: {
      total_invested: number;
      total_sold: number;
    };
  };
}

export async function getWalletPnlSummary(
  walletAddress: string,
  options?: { duration?: "all" | "90d" | "30d" | "7d" | "24h" }
): Promise<BirdeyeWalletPnlSummary> {
  const params = new URLSearchParams({
    wallet: walletAddress,
    duration: options?.duration ?? "30d",
  });
  const res = await birdeyeFetch(`${BIRDEYE_API_BASE}/wallet/v2/pnl/summary?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Birdeye wallet PnL request failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  return json.data;
}
