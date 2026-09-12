import { sanitizeSecret } from "./sanitize";

const HELIUS_API_BASE = "https://api.helius.xyz/v0";
const HELIUS_RPC_BASE = "https://mainnet.helius-rpc.com";

function getApiKey(): string {
  const key = process.env.HELIUS_API_KEY;
  if (!key) throw new Error("HELIUS_API_KEY is not set");
  return sanitizeSecret(key);
}

// Discovery now fires several wallets' history fetches concurrently
// (see CANDIDATE_CONCURRENCY in discovery.ts) — occasionally trips Helius's
// own rate limit. A single retry-after-backoff clears almost all of those
// without falling back to fully serializing every Helius call. The timeout
// bounds worst-case latency so one stalled request can't blow the discovery
// cron's overall time budget.
async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  let res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  if (res.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  }
  return res;
}

export interface HeliusTokenTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  tokenAmount: number;
  mint: string;
}

export interface HeliusEnhancedTransaction {
  signature: string;
  timestamp: number;
  type: string;
  source: string;
  fee: number;
  feePayer: string;
  tokenTransfers: HeliusTokenTransfer[];
  nativeTransfers: {
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }[];
}

export async function getEnhancedTransactions(
  address: string,
  options?: { limit?: number; before?: string }
): Promise<HeliusEnhancedTransaction[]> {
  const params = new URLSearchParams({ "api-key": getApiKey() });
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.before) params.set("before", options.before);

  const res = await fetchWithRetry(
    `${HELIUS_API_BASE}/addresses/${address}/transactions?${params.toString()}`
  );
  if (!res.ok) {
    throw new Error(`Helius request failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export interface EarlyBuyer {
  address: string;
  firstSeenAt: Date;
}

/**
 * Reconstructs "early buyers" from Helius's own transaction history instead
 * of a dedicated first-buyers API: fetches the mint's most recent SWAP
 * activity and, per buyer wallet, keeps the earliest timestamp seen within
 * that window. This is "earliest buyer visible in the last `limit`
 * transactions", not "first buyer since the token's genesis" — for a
 * newly-trending token those are close; for a long-established one they
 * are not, since Helius returns newest-first and we never page back further.
 */
export async function getEarlyBuyers(
  tokenMintAddress: string,
  options?: { limit?: number; maxBuyers?: number }
): Promise<EarlyBuyer[]> {
  const txs = await getEnhancedTransactions(tokenMintAddress, { limit: options?.limit ?? 100 });

  const earliestSeenAt = new Map<string, number>();
  for (const tx of txs) {
    if (tx.type !== "SWAP") continue;
    for (const transfer of tx.tokenTransfers ?? []) {
      if (transfer.mint !== tokenMintAddress || transfer.tokenAmount <= 0 || !transfer.toUserAccount) {
        continue;
      }
      const existing = earliestSeenAt.get(transfer.toUserAccount);
      if (existing === undefined || tx.timestamp < existing) {
        earliestSeenAt.set(transfer.toUserAccount, tx.timestamp);
      }
    }
  }

  return [...earliestSeenAt.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, options?.maxBuyers ?? 10)
    .map(([address, ts]) => ({ address, firstSeenAt: new Date(ts * 1000) }));
}

export interface CreateWebhookParams {
  webhookURL: string;
  transactionTypes: string[];
  accountAddresses: string[];
  webhookType?: "enhanced" | "raw";
  authHeader?: string;
}

export interface HeliusWebhook {
  webhookID: string;
  wallet: string;
  webhookURL: string;
  transactionTypes: string[];
  accountAddresses: string[];
  webhookType: string;
}

export async function createWebhook(params: CreateWebhookParams): Promise<HeliusWebhook> {
  const res = await fetch(`${HELIUS_API_BASE}/webhooks?api-key=${getApiKey()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      webhookURL: params.webhookURL,
      transactionTypes: params.transactionTypes,
      accountAddresses: params.accountAddresses,
      webhookType: params.webhookType ?? "enhanced",
      authHeader: params.authHeader,
    }),
  });
  if (!res.ok) {
    throw new Error(`Helius webhook creation failed: ${res.status} ${res.statusText} — ${await res.text()}`);
  }
  return res.json();
}

export async function listWebhooks(): Promise<HeliusWebhook[]> {
  const res = await fetch(`${HELIUS_API_BASE}/webhooks?api-key=${getApiKey()}`);
  if (!res.ok) {
    throw new Error(`Helius webhook list failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getWebhook(webhookId: string): Promise<HeliusWebhook> {
  const res = await fetch(`${HELIUS_API_BASE}/webhooks/${webhookId}?api-key=${getApiKey()}`);
  if (!res.ok) {
    throw new Error(`Helius webhook fetch failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function updateWebhook(
  webhookId: string,
  params: CreateWebhookParams
): Promise<HeliusWebhook> {
  const res = await fetch(`${HELIUS_API_BASE}/webhooks/${webhookId}?api-key=${getApiKey()}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      webhookURL: params.webhookURL,
      transactionTypes: params.transactionTypes,
      accountAddresses: params.accountAddresses,
      webhookType: params.webhookType ?? "enhanced",
      authHeader: params.authHeader,
    }),
  });
  if (!res.ok) {
    throw new Error(`Helius webhook update failed: ${res.status} ${res.statusText} — ${await res.text()}`);
  }
  return res.json();
}

export async function deleteWebhook(webhookId: string): Promise<void> {
  const res = await fetch(`${HELIUS_API_BASE}/webhooks/${webhookId}?api-key=${getApiKey()}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`Helius webhook delete failed: ${res.status} ${res.statusText}`);
  }
}

export async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(`${HELIUS_RPC_BASE}/?api-key=${getApiKey()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "tracethewhales", method, params }),
  });
  if (!res.ok) {
    throw new Error(`Helius RPC request failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  if (json.error) {
    throw new Error(`Helius RPC error: ${json.error.message}`);
  }
  return json.result as T;
}

interface MintAccountInfoResult {
  value: {
    data: {
      parsed: {
        info: {
          mintAuthority: string | null;
          freezeAuthority: string | null;
        };
      };
    } | null;
  } | null;
}

export interface MintAuthorities {
  mintAuthority: string | null;
  freezeAuthority: string | null;
}

/**
 * Whether this mint's authorities are still live — a still-active mint
 * authority means the deployer can print more supply at will; a still-active
 * freeze authority means they can lock any holder's tokens at will. Both are
 * classic rug vectors, and both are plain fields on the on-chain SPL Token
 * Mint account itself (via getAccountInfo, jsonParsed) — not dependent on
 * any third-party indexer's curation or lag, unlike Jupiter's equivalent
 * `audit` field (already used in lib/discovery.ts, but only for tokens that
 * happen to appear in Jupiter's trending list).
 */
export async function getMintAuthorities(mint: string): Promise<MintAuthorities> {
  const result = await rpcCall<MintAccountInfoResult>("getAccountInfo", [mint, { encoding: "jsonParsed" }]);
  const info = result.value?.data?.parsed?.info;
  if (!info) throw new Error(`Mint account not found or not parseable for ${mint}`);
  return { mintAuthority: info.mintAuthority, freezeAuthority: info.freezeAuthority };
}

interface TokenAccountsByOwnerResult {
  value: {
    account: {
      data: {
        parsed: {
          info: {
            tokenAmount: { amount: string; decimals: number; uiAmount: number | null };
          };
        };
      };
    };
  }[];
}

/**
 * Current on-chain balance for one mint in one wallet — used to tell a fully
 * exited token position apart from a partial sell (our own Transaction rows
 * only record USD flow in/out, not what's still held).
 */
export async function getTokenBalance(walletAddress: string, mint: string): Promise<number> {
  const result = await rpcCall<TokenAccountsByOwnerResult>("getTokenAccountsByOwner", [
    walletAddress,
    { mint },
    { encoding: "jsonParsed" },
  ]);
  return result.value.reduce((sum, acc) => {
    const info = acc.account.data.parsed.info.tokenAmount;
    const uiAmount = info.uiAmount ?? Number(info.amount) / 10 ** info.decimals;
    return sum + (Number.isFinite(uiAmount) ? uiAmount : 0);
  }, 0);
}
