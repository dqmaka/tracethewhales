import { sanitizeSecret } from "./sanitize";

const FOMO_API_BASE = "https://api.fomoapi.io";

function getHeaders(): HeadersInit {
  const key = process.env.FOMO_API_KEY;
  if (!key) throw new Error("FOMO_API_KEY is not set");
  return { authorization: `Bearer ${sanitizeSecret(key)}` };
}

export interface FomoTrader {
  rank: number;
  handle: string;
  displayName: string;
  pnlUsd: number;
  volumeUsd: number;
  trades: number;
  wallets: { solana: string | null; evm: string | null; verified: boolean };
}

export async function getLeaderboard(
  window: "24h" | "7d" | "30d" | "all" = "30d",
  limit = 50
): Promise<FomoTrader[]> {
  const res = await fetch(`${FOMO_API_BASE}/v2/leaderboard/${window}?limit=${limit}`, {
    headers: getHeaders(),
    // Measured a legitimate ~10.8s response time during a live check — the
    // previous 10s cap was cutting off a working call, not a hung one. Kept
    // close to that measurement rather than pushed much higher: this call
    // runs inside collectCandidates in lib/discovery.ts, which isn't itself
    // covered by DISCOVERY_TIME_BUDGET_MS, so its worst case eats directly
    // into the cron's overall 30s ceiling (cron-job.org's own timeout).
    signal: AbortSignal.timeout(11_000),
  });
  if (!res.ok) {
    throw new Error(`FOMO leaderboard request failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  return json.traders ?? [];
}

export interface FomoTrade {
  tradeId: string;
  status: "open" | "closed" | string;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
}

export interface FomoTradesResponse {
  trades: FomoTrade[];
  activeCount: number;
  closedCount: number;
}

/**
 * Leaderboard `pnlUsd` is documented as realized-only, which a trader can
 * inflate simply by never closing losing positions — they never count. This
 * endpoint's `activeCount`/`closedCount` (whole-account, not sample-limited)
 * plus a small trade sample let discovery.ts penalize that pattern.
 */
export async function getTraderTrades(handle: string, limit = 30): Promise<FomoTradesResponse> {
  const res = await fetch(`${FOMO_API_BASE}/v2/users/${handle}/trades?limit=${limit}`, {
    headers: getHeaders(),
    // Same reasoning as getLeaderboard's timeout above — this call runs once
    // per trusted candidate inside discovery.ts's already time-budgeted
    // batch loop, so a slow response here eats into that budget too.
    signal: AbortSignal.timeout(11_000),
  });
  if (!res.ok) {
    throw new Error(`FOMO trades request failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  return {
    trades: json.trades ?? [],
    activeCount: json.activeCount ?? 0,
    closedCount: json.closedCount ?? 0,
  };
}
