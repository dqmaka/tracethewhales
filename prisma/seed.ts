// prisma/seed.ts
// Überführt die bisherigen Mock-Daten aus dem Dashboard-Mockup in echte
// Datenbank-Einträge, damit Claude Code direkt mit sinnvollen Startdaten
// weiterarbeiten kann, bevor die Helius-Webhooks live Daten liefern.

import { PrismaClient, TxType, AlertKind } from "@prisma/client";

const prisma = new PrismaClient();

const wallets = [
  { address: "7xKX9v3s6h1a4pQm2f8dRzT9pQm", label: "Whale #1", tag: "Early adopter", smartScore: 94, pnl30d: 182.4 },
  { address: "3nRt7q2w9e1r4t6y8u0iL4kLp", label: "Fund wallet", tag: "DeFi pro", smartScore: 89, pnl30d: 96.1 },
  { address: "9mQz5b3n7m1k4j6h8g0f2wXe", label: "Insider?", tag: "Suspected insider", smartScore: 87, pnl30d: 341.7 },
  { address: "5vBn8c2x6z4a1s3d5f7g9h8jUy", label: "Memecoin king", tag: "Memecoin flipper", smartScore: 81, pnl30d: -12.3 },
  { address: "2cDf4e6r8t0y2u4i6o8p6hTr", label: "Whale #2", tag: "Whale", smartScore: 78, pnl30d: 54.8 },
  { address: "6qLp1a3s5d7f9g1h3j5k9zXk", label: null, tag: null, smartScore: 62, pnl30d: 0 },
];

const tokens = [
  { symbol: "JUP", mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", name: "Jupiter" },
  { symbol: "SOL", mint: "So11111111111111111111111111111111111111112", name: "Solana" },
  { symbol: "BONK", mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", name: "Bonk" },
  { symbol: "WIF", mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", name: "dogwifhat" },
  { symbol: "PYTH", mint: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3", name: "Pyth Network" },
];

interface SeedActivityItem {
  walletAddr: string;
  tokenSymbol: string | null;
  type: TxType | null;
  amountUsd: number | null;
  minutesAgo: number;
  kind: AlertKind;
  important: boolean;
  note?: string;
}

// Rohdaten für den bisherigen "Live Feed" -> werden zu Transactions + Alerts
const seedActivity: SeedActivityItem[] = [
  { walletAddr: "7xKX9v3s6h1a4pQm2f8dRzT9pQm", tokenSymbol: "JUP", type: TxType.BUY, amountUsd: 48200, minutesAgo: 2, kind: AlertKind.WHALE_BUY, important: true },
  { walletAddr: "9mQz5b3n7m1k4j6h8g0f2wXe", tokenSymbol: "WIF", type: TxType.SELL, amountUsd: 112000, minutesAgo: 6, kind: AlertKind.LARGE_TRANSACTION, important: false },
  { walletAddr: "6qLp1a3s5d7f9g1h3j5k9zXk", tokenSymbol: null, type: null, amountUsd: null, minutesAgo: 11, kind: AlertKind.NEW_WALLET, important: false, note: "first activity" },
  { walletAddr: "2cDf4e6r8t0y2u4i6o8p6hTr", tokenSymbol: "PYTH", type: TxType.BUY, amountUsd: 67500, minutesAgo: 18, kind: AlertKind.UNUSUAL_MOVEMENT, important: false },
];

// Sparkline-Werte aus dem Mockup -> als 10 tägliche ScoreSnapshots interpretiert
const sparkByAddress: Record<string, number[]> = {
  "7xKX9v3s6h1a4pQm2f8dRzT9pQm": [4, 6, 5, 8, 7, 10, 12, 11, 15, 18],
  "3nRt7q2w9e1r4t6y8u0iL4kLp": [6, 7, 6, 8, 9, 8, 10, 11, 10, 13],
  "9mQz5b3n7m1k4j6h8g0f2wXe": [3, 5, 4, 9, 8, 14, 13, 19, 22, 26],
  "5vBn8c2x6z4a1s3d5f7g9h8jUy": [10, 9, 11, 8, 9, 7, 8, 6, 6, 5],
  "2cDf4e6r8t0y2u4i6o8p6hTr": [5, 6, 8, 7, 9, 10, 9, 12, 11, 14],
};

async function main() {
  for (const t of tokens) {
    await prisma.token.upsert({ where: { mint: t.mint }, update: {}, create: t });
  }

  for (const w of wallets) {
    await prisma.wallet.upsert({ where: { address: w.address }, update: {}, create: w });
  }

  for (const [address, values] of Object.entries(sparkByAddress)) {
    const wallet = await prisma.wallet.findUnique({ where: { address } });
    if (!wallet) continue;
    const today = new Date();
    for (let i = 0; i < values.length; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - (values.length - i));
      await prisma.scoreSnapshot.upsert({
        where: { walletId_date: { walletId: wallet.id, date } },
        update: { score: values[i] },
        create: { walletId: wallet.id, score: values[i], date },
      });
    }
  }

  for (const a of seedActivity) {
    const wallet = await prisma.wallet.findUnique({ where: { address: a.walletAddr } });
    if (!wallet) continue;

    if (a.tokenSymbol && a.type && a.amountUsd) {
      const tokenDef = tokens.find((t) => t.symbol === a.tokenSymbol);
      const token = tokenDef ? await prisma.token.findUnique({ where: { mint: tokenDef.mint } }) : null;
      if (token) {
        await prisma.transaction.create({
          data: {
            walletId: wallet.id,
            tokenId: token.id,
            type: a.type,
            amountUsd: a.amountUsd,
            txHash: `${wallet.address}-${token.symbol}-${a.minutesAgo}`,
            occurredAt: new Date(Date.now() - a.minutesAgo * 60_000),
          },
        });
      }
    }

    await prisma.alert.create({
      data: {
        kind: a.kind,
        walletAddr: wallet.address,
        tokenSymbol: a.tokenSymbol ?? undefined,
        amountUsd: a.amountUsd ?? undefined,
        note: a.note ?? undefined,
        important: a.important,
        createdAt: new Date(Date.now() - a.minutesAgo * 60_000),
      },
    });
  }

  console.log("Seed abgeschlossen.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
