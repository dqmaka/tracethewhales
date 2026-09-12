// Registers (or updates) a Helius webhook so it forwards SWAP transactions
// for every tracked wallet to /api/webhooks/helius. Requires a public
// HTTPS URL (APP_URL) — Helius cannot deliver to localhost, so for local
// testing point APP_URL at an ngrok/cloudflared tunnel.

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { syncHeliusWebhook } from "../lib/webhook-sync";

async function main() {
  const result = await syncHeliusWebhook();

  if (result.status === "skipped") {
    console.error(`Skipped: ${result.reason}.`);
    if (result.reason === "APP_URL is not set") {
      console.error(
        'Set APP_URL in .env, e.g. APP_URL="https://your-app.vercel.app" ' +
          "(or an ngrok/cloudflared tunnel for local testing)."
      );
    }
    if (result.reason === "no watched wallets") {
      console.error("Add one first: npm run wallet:add -- <address> [label]");
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `${result.status === "created" ? "Created" : "Updated"} webhook ${result.webhookId} — ` +
      `now tracking ${result.trackedCount} wallet(s).`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
