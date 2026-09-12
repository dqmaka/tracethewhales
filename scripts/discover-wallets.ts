// Scans Birdeye's trending tokens / top traders / gainers-losers for
// candidate wallets, scores them with our own smart-score model using their
// real Helius trade history, and tracks the ones that qualify. Run manually,
// or via the /api/cron/discover-wallets route on a schedule.

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { discoverSmartMoneyWallets } from "../lib/discovery";

async function main() {
  if (!process.env.BIRDEYE_API_KEY || !process.env.HELIUS_API_KEY) {
    console.error("BIRDEYE_API_KEY and HELIUS_API_KEY must both be set in .env.");
    process.exitCode = 1;
    return;
  }

  const result = await discoverSmartMoneyWallets();

  console.log(`Scanned ${result.candidatesScanned} candidate wallet(s).`);
  if (result.qualified.length === 0) {
    console.log("None met the smart-score threshold this run.");
  } else {
    console.log(`${result.qualified.length} qualified and are now tracked:`);
    for (const w of result.qualified) {
      console.log(`  ${w.address}  score=${w.score}  pnl30d=${w.pnl30d}%  (${w.label})`);
    }
  }

  if (result.webhookSync.status === "skipped") {
    console.log(`Webhook sync skipped: ${result.webhookSync.reason}.`);
  } else {
    console.log(
      `Webhook ${result.webhookSync.status} (${result.webhookSync.webhookId}) — tracking ${result.webhookSync.trackedCount} wallet(s) live.`
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
