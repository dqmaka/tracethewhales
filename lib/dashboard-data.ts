import { prisma } from "@/lib/prisma";
import type { Tone } from "@/components/theme";
import { formatUsd } from "@/lib/format";
import { getLiveWalletActivity } from "@/lib/wallet-activity";
import { getTokenBalance, getMintAuthorities } from "@/lib/helius";
import { getHistoricalPrice } from "@/lib/geckoterminal";
import { getTokenOverview } from "@/lib/dexscreener";
import type { SmartScoreBreakdown } from "@/lib/scoring";
import { BASE_TOKEN_MINTS, BASE_TOKEN_SYMBOLS } from "@/lib/constants";

export interface WalletRow {
  address: string;
  label: string | null;
  score: number;
  pnl: number;
  spark: number[];
}

export async function getTopWallets(limit = 5): Promise<WalletRow[]> {
  const wallets = await prisma.wallet.findMany({
    where: { isWatched: true },
    orderBy: { smartScore: "desc" },
    take: limit,
    include: { scoreHistory: { orderBy: { date: "asc" }, take: 10 } },
  });

  return wallets.map((w) => ({
    address: w.address,
    label: w.label,
    score: w.smartScore,
    pnl: w.pnl30d,
    spark: w.scoreHistory.length > 1 ? w.scoreHistory.map((s) => s.score) : [w.smartScore, w.smartScore],
  }));
}

export interface AlertItem {
  kind: string;
  time: Date;
  wallet: string;
  token: string | null;
  /** Null for alerts recorded before this field existed — the feed falls
   * back to a non-clickable row for those. */
  tokenMint: string | null;
  amount: string | null;
  tone: Tone;
  important: boolean;
}

const KIND_TONE: Record<string, Tone> = {
  WHALE_BUY: "mint",
  LARGE_TRANSACTION: "cyan",
  NEW_WALLET: "violet",
  UNUSUAL_MOVEMENT: "coral",
  TOKEN_FLOW_ALERT: "mint",
};

export async function getLiveAlerts(limit = 4): Promise<AlertItem[]> {
  const alerts = await prisma.alert.findMany({
    where: { OR: [{ tokenSymbol: null }, { tokenSymbol: { notIn: [...BASE_TOKEN_SYMBOLS] } }] },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return alerts.map((a) => ({
    kind: a.kind.replace(/_/g, " "),
    time: a.createdAt,
    wallet: a.walletAddr,
    token: a.tokenSymbol,
    tokenMint: a.tokenMint,
    amount: a.note ?? (a.amountUsd != null ? formatUsd(a.amountUsd) : null),
    tone: KIND_TONE[a.kind] ?? "cyan",
    important: a.important,
  }));
}

export interface FlowItem {
  symbol: string;
  mint: string;
  pct: number;
  inflowUsd: number;
  whales: number;
}

/**
 * pct = this token's share of total tracked BUY volume across all tokens
 * (not a time-based growth rate — there's no historical baseline stored yet).
 */
export async function getTokenFlows(limit = 3): Promise<FlowItem[]> {
  // Grouped by (tokenId, walletId) rather than pulling every raw Transaction
  // row — this collapses each wallet's repeat buys of the same token into
  // one summed row server-side, so the amount of data pulled into Node
  // scales with distinct token×wallet pairs, not total transaction count.
  const grouped = await prisma.transaction.groupBy({
    by: ["tokenId", "walletId"],
    where: {
      type: "BUY",
      wallet: { isWatched: true },
      token: { mint: { notIn: [...BASE_TOKEN_MINTS] } }, // SOL/USDC/USDT are the swap's other leg, not the bet
    },
    _sum: { amountUsd: true },
  });

  const byToken = new Map<string, { inflowUsd: number; wallets: Set<string> }>();
  for (const row of grouped) {
    const entry = byToken.get(row.tokenId) ?? { inflowUsd: 0, wallets: new Set<string>() };
    entry.inflowUsd += row._sum.amountUsd ?? 0;
    entry.wallets.add(row.walletId);
    byToken.set(row.tokenId, entry);
  }

  const totalInflow = [...byToken.values()].reduce((sum, e) => sum + e.inflowUsd, 0) || 1;

  const topTokenIds = [...byToken.entries()]
    .sort((a, b) => b[1].inflowUsd - a[1].inflowUsd)
    .slice(0, limit)
    .map(([tokenId]) => tokenId);

  const tokens = await prisma.token.findMany({ where: { id: { in: topTokenIds } } });
  const tokenById = new Map(tokens.map((t) => [t.id, t]));

  return topTokenIds.map((tokenId) => {
    const entry = byToken.get(tokenId)!;
    const token = tokenById.get(tokenId)!;
    return {
      symbol: token.symbol,
      mint: token.mint,
      inflowUsd: entry.inflowUsd,
      whales: entry.wallets.size,
      pct: Math.round((entry.inflowUsd / totalInflow) * 100),
    };
  });
}

export interface TopTokenPerformance {
  symbol: string;
  mint: string;
  pnlPercent: number;
  totalBuyUsd: number;
  totalSellUsd: number;
  /** true = wallet still holds a nonzero on-chain balance of this token, so
   * pnlPercent only reflects the already-sold slice, not the full position. */
  hasOpenPosition: boolean;
}

/**
 * Realized-style PnL per token, computed straight from our own tracked
 * Transaction rows: total bought vs. total sold. Only tokens with *both* a
 * buy and a sell on record are included — without a cost basis on one side
 * a "% profit" would be meaningless (either -100% or undefined), not just
 * imprecise.
 */
async function getWalletTopTokens(walletId: string, walletAddress: string, limit = 5): Promise<TopTokenPerformance[]> {
  // Grouped by (tokenId, type) so buy/sell totals per token come straight
  // out of the DB instead of loading every raw Transaction row for a wallet
  // that may have traded the same token dozens of times.
  const grouped = await prisma.transaction.groupBy({
    by: ["tokenId", "type"],
    where: { walletId, token: { mint: { notIn: [...BASE_TOKEN_MINTS] } } }, // SOL/USDC/USDT are the swap's other leg, not the bet
    _sum: { amountUsd: true },
  });

  const byToken = new Map<string, { buyUsd: number; sellUsd: number }>();
  for (const row of grouped) {
    const entry = byToken.get(row.tokenId) ?? { buyUsd: 0, sellUsd: 0 };
    if (row.type === "BUY") entry.buyUsd += row._sum.amountUsd ?? 0;
    else entry.sellUsd += row._sum.amountUsd ?? 0;
    byToken.set(row.tokenId, entry);
  }

  const qualifying = [...byToken.entries()].filter(([, v]) => v.buyUsd > 0 && v.sellUsd > 0);
  const tokens = await prisma.token.findMany({ where: { id: { in: qualifying.map(([tokenId]) => tokenId) } } });
  const tokenById = new Map(tokens.map((t) => [t.id, t]));

  const top = qualifying
    .map(([tokenId, v]) => {
      const token = tokenById.get(tokenId)!;
      return {
        symbol: token.symbol,
        mint: token.mint,
        pnlPercent: Math.round(((v.sellUsd - v.buyUsd) / v.buyUsd) * 1000) / 10,
        totalBuyUsd: v.buyUsd,
        totalSellUsd: v.sellUsd,
      };
    })
    .sort((a, b) => b.pnlPercent - a.pnlPercent)
    .slice(0, limit);

  const balances = await Promise.all(
    top.map((t) =>
      getTokenBalance(walletAddress, t.mint).catch((err) => {
        console.warn(`Token balance lookup failed for ${walletAddress}/${t.mint}:`, (err as Error).message);
        return 0;
      })
    )
  );

  return top.map((t, i) => ({ ...t, hasOpenPosition: balances[i] > 0.000001 }));
}

export interface WalletDetail {
  address: string;
  label: string | null;
  tag: string | null;
  score: number;
  pnl30d: number;
  firstSeenAt: Date;
  isWatched: boolean;
  scoreHistory: { date: Date; score: number }[];
  topTokens: TopTokenPerformance[];
  trackedTransactions: {
    token: string;
    type: "BUY" | "SELL";
    amountUsd: number;
    occurredAt: Date;
    txHash: string;
    signature: string;
  }[];
  liveActivity: {
    breakdown: SmartScoreBreakdown;
    recent: {
      tokenMint: string;
      type: "BUY" | "SELL";
      amountUsd: number;
      occurredAt: Date;
      signature: string | null;
    }[];
  } | null;
}

export async function getWalletDetail(address: string): Promise<WalletDetail | null> {
  const wallet = await prisma.wallet.findUnique({
    where: { address },
    include: {
      scoreHistory: { orderBy: { date: "asc" } },
      transactions: {
        where: { token: { mint: { notIn: [...BASE_TOKEN_MINTS] } } },
        orderBy: { occurredAt: "desc" },
        take: 20,
        include: { token: true },
      },
    },
  });
  if (!wallet) return null;

  const topTokens = await getWalletTopTokens(wallet.id, wallet.address);

  let liveActivity: WalletDetail["liveActivity"] = null;
  try {
    const { transactions, breakdown } = await getLiveWalletActivity(address, 50);
    liveActivity = {
      // `breakdown` (the score) is computed from the *full* transaction set
      // above, including SOL/USDC legs — only the displayed list is filtered
      // to memecoin trades, so filtering here can't shift the smart score.
      breakdown,
      recent: transactions
        .filter((t) => !BASE_TOKEN_MINTS.has(t.tokenKey))
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
        .slice(0, 15)
        .map((t) => ({
          tokenMint: t.tokenKey,
          type: t.type,
          amountUsd: t.amountUsd,
          occurredAt: t.occurredAt,
          signature: t.signature ?? null,
        })),
    };
  } catch (err) {
    console.warn(`Live activity fetch failed for ${address}:`, (err as Error).message);
  }

  return {
    address: wallet.address,
    label: wallet.label,
    tag: wallet.tag,
    score: wallet.smartScore,
    pnl30d: wallet.pnl30d,
    firstSeenAt: wallet.firstSeenAt,
    isWatched: wallet.isWatched,
    scoreHistory: wallet.scoreHistory.map((s) => ({ date: s.date, score: s.score })),
    topTokens,
    trackedTransactions: wallet.transactions.map((t) => ({
      token: t.token.symbol,
      type: t.type,
      amountUsd: t.amountUsd,
      occurredAt: t.occurredAt,
      txHash: t.txHash,
      // The webhook stores txHash as `${signature}-${mint}` (composite, for
      // per-transfer uniqueness) — the real signature is the part before it.
      signature: t.txHash.split("-")[0],
    })),
    liveActivity,
  };
}

export interface TokenWalletActivity {
  address: string;
  label: string | null;
  buyUsd: number;
  sellUsd: number;
  lastActivityAt: Date;
}

export interface TokenPricePoint {
  time: number; // unix seconds
  value: number;
}

export interface TokenTradeMarker {
  type: "BUY" | "SELL";
  amountUsd: number;
  occurredAt: Date;
}

export interface TokenDetail {
  mint: string;
  symbol: string;
  name: string | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  totalBuyUsd: number;
  totalSellUsd: number;
  walletCount: number;
  wallets: TokenWalletActivity[];
  priceHistory: TokenPricePoint[];
  focusWallet: { address: string; label: string | null; trades: TokenTradeMarker[] } | null;
  /** null = the on-chain lookup itself failed — distinct from a verified
   * "renounced" (false). Never treat null as "safe". */
  mintAuthorityActive: boolean | null;
  freezeAuthorityActive: boolean | null;
}

const PRICE_HISTORY_DAYS = 7;

/**
 * Everything our own tracked wallets have done with one token, plus a
 * best-effort GeckoTerminal price line for context. `focusWalletAddress` is set
 * when this page was reached from a specific wallet's "top tokens" card —
 * lets the chart mark that wallet's own buys/sells instead of just showing
 * price in a vacuum.
 */
export async function getTokenDetail(mint: string, focusWalletAddress?: string): Promise<TokenDetail | null> {
  const token = await prisma.token.findUnique({ where: { mint } });
  if (!token) return null;

  // Grouped by (walletId, type) instead of loading every raw Transaction row
  // for this token — a popular token traded by many wallets many times each
  // would otherwise mean loading unboundedly many rows on every page view.
  const perWallet = await prisma.transaction.groupBy({
    by: ["walletId", "type"],
    where: { tokenId: token.id },
    _sum: { amountUsd: true },
    _max: { occurredAt: true },
  });

  const byWallet = new Map<string, { buyUsd: number; sellUsd: number; lastActivityAt: Date }>();
  let totalBuyUsd = 0;
  let totalSellUsd = 0;
  for (const row of perWallet) {
    const sum = row._sum.amountUsd ?? 0;
    if (row.type === "BUY") totalBuyUsd += sum;
    else totalSellUsd += sum;

    const entry = byWallet.get(row.walletId) ?? { buyUsd: 0, sellUsd: 0, lastActivityAt: new Date(0) };
    if (row.type === "BUY") entry.buyUsd += sum;
    else entry.sellUsd += sum;
    if (row._max.occurredAt && row._max.occurredAt > entry.lastActivityAt) entry.lastActivityAt = row._max.occurredAt;
    byWallet.set(row.walletId, entry);
  }

  const walletRows = await prisma.wallet.findMany({ where: { id: { in: [...byWallet.keys()] } } });
  const walletById = new Map(walletRows.map((w) => [w.id, w]));

  const wallets: TokenWalletActivity[] = [...byWallet.entries()]
    .map(([walletId, v]) => {
      const w = walletById.get(walletId)!;
      return { address: w.address, label: w.label, buyUsd: v.buyUsd, sellUsd: v.sellUsd, lastActivityAt: v.lastActivityAt };
    })
    .sort((a, b) => b.buyUsd + b.sellUsd - (a.buyUsd + a.sellUsd));

  let priceUsd: number | null = null;
  let liquidityUsd: number | null = null;
  try {
    const overview = await getTokenOverview(mint);
    priceUsd = overview.priceUsd;
    liquidityUsd = overview.liquidityUsd;
  } catch (err) {
    console.warn(`DexScreener price lookup failed for ${mint}:`, (err as Error).message);
  }

  let priceHistory: TokenPricePoint[] = [];
  try {
    const to = Math.floor(Date.now() / 1000);
    const from = to - PRICE_HISTORY_DAYS * 86_400;
    const points = await getHistoricalPrice(mint, { from, to, type: "1H" });
    priceHistory = points.map((p) => ({ time: p.unixTime, value: p.value }));
  } catch (err) {
    console.warn(`GeckoTerminal price history lookup failed for ${mint}:`, (err as Error).message);
  }

  let mintAuthorityActive: boolean | null = null;
  let freezeAuthorityActive: boolean | null = null;
  try {
    const authorities = await getMintAuthorities(mint);
    mintAuthorityActive = authorities.mintAuthority !== null;
    freezeAuthorityActive = authorities.freezeAuthority !== null;
  } catch (err) {
    console.warn(`Mint authority lookup failed for ${mint}:`, (err as Error).message);
  }

  let focusWallet: TokenDetail["focusWallet"] = null;
  if (focusWalletAddress) {
    // The chart markers need individual trades (timestamp + type + amount),
    // not just an aggregate — but only ever for this one specific wallet, so
    // a targeted query here is still far cheaper than loading every
    // transaction for the whole token just to filter down to one wallet.
    const focusTxs = await prisma.transaction.findMany({
      where: { tokenId: token.id, wallet: { address: focusWalletAddress } },
      include: { wallet: true },
      orderBy: { occurredAt: "desc" },
    });
    if (focusTxs.length > 0) {
      focusWallet = {
        address: focusWalletAddress,
        label: focusTxs[0].wallet.label,
        trades: focusTxs.map((t) => ({ type: t.type, amountUsd: t.amountUsd, occurredAt: t.occurredAt })),
      };
    }
  }

  return {
    mint: token.mint,
    symbol: token.symbol,
    name: token.name,
    priceUsd,
    liquidityUsd,
    totalBuyUsd,
    totalSellUsd,
    walletCount: byWallet.size,
    wallets,
    priceHistory,
    focusWallet,
    mintAuthorityActive,
    freezeAuthorityActive,
  };
}

export interface DashboardKpis {
  trackedVolumeUsd: number;
  walletsTracked: number;
  avgSmartScore: number;
}

export async function getDashboardKpis(): Promise<DashboardKpis> {
  const [volume, walletStats] = await Promise.all([
    prisma.transaction.aggregate({
      where: { wallet: { isWatched: true } },
      _sum: { amountUsd: true },
    }),
    prisma.wallet.aggregate({ where: { isWatched: true }, _avg: { smartScore: true }, _count: true }),
  ]);

  return {
    trackedVolumeUsd: volume._sum.amountUsd ?? 0,
    walletsTracked: walletStats._count,
    avgSmartScore: Math.round(walletStats._avg.smartScore ?? 0),
  };
}
