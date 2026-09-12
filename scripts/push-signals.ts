// Pushes newly-qualifying trade signals (conviction >= 60, not already
// pushed within the last 24h) to the Telegram channel. Run manually, or via
// the /api/cron/push-signals route on a schedule.

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { pushNewSignalsToTelegram } from "../lib/signal-push";

async function main() {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must both be set in .env.");
    process.exitCode = 1;
    return;
  }

  const result = await pushNewSignalsToTelegram();

  if (result.pushed.length === 0) {
    console.log(`Nothing new to push (${result.skipped} skipped — already pushed within the cooldown window).`);
  } else {
    console.log(`Pushed ${result.pushed.length} signal(s): ${result.pushed.join(", ")}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
