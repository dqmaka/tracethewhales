// Populates real Transaction rows (and matching Alerts) for every currently
// tracked wallet from their existing Helius history, instead of waiting for
// future webhook events. Safe to re-run — already-seen (signature, mint,
// wallet) combinations are skipped via the same txHash uniqueness the
// webhook relies on.

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { getEnhancedTransactions } from "../lib/helius";
import { toScorableTransactions } from "../lib/wallet-activity";
import { upsertToken } from "../lib/tokens";
import { maybeCreateAlert, maybeCreateTokenFlowAlert, UNUSUAL_MOVEMENT_MIN_SAMPLE } from "../lib/alerts";

const HISTORY_LIMIT = 100;

async function main() {
  const wallets = await prisma.wallet.findMany({ where: { isWatched: true } });
  console.log(`Backfilling ${wallets.length} tracked wallet(s)...`);

  let totalInserted = 0;
  for (const wallet of wallets) {
    try {
      const txs = await getEnhancedTransactions(wallet.address, { limit: HISTORY_LIMIT });
      const trades = await toScorableTransactions(wallet.address, txs);
      trades.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

      let inserted = 0;
      for (const trade of trades) {
        if (!trade.signature) continue;

        const txHash = `${trade.signature}-${trade.tokenKey}-${wallet.address}`;
        const existing = await prisma.transaction.findUnique({ where: { txHash } });
        if (existing) continue;

        const token = await upsertToken(trade.tokenKey);
        const priorStats = await prisma.transaction.aggregate({
          where: { walletId: wallet.id },
          _count: true,
          _avg: { amountUsd: true },
        });

        await prisma.transaction.create({
          data: {
            walletId: wallet.id,
            tokenId: token.id,
            type: trade.type,
            amountUsd: trade.amountUsd,
            txHash,
            occurredAt: trade.occurredAt,
          },
        });

        await maybeCreateAlert(wallet, token.symbol, token.mint, trade, {
          isFirstEverTransaction: priorStats._count === 0,
          priorAvgAmountUsd: priorStats._count >= UNUSUAL_MOVEMENT_MIN_SAMPLE ? priorStats._avg.amountUsd : null,
        });
        await maybeCreateTokenFlowAlert(wallet, token.id, token.symbol, token.mint, trade);
        inserted += 1;
      }

      console.log(`  ${wallet.label ?? wallet.address}: +${inserted} transaction(s)`);
      totalInserted += inserted;
    } catch (err) {
      console.warn(`  Failed for ${wallet.address}:`, (err as Error).message);
    }
  }

  console.log(`Done — ${totalInserted} transaction(s) inserted across ${wallets.length} wallet(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
