// Adds (or re-activates) a wallet to track. Run `npm run webhook:sync`
// afterwards to register it with Helius.

import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  const [address, label] = process.argv.slice(2);
  if (!address) {
    console.error("Usage: npm run wallet:add -- <address> [label]");
    process.exitCode = 1;
    return;
  }

  const wallet = await prisma.wallet.upsert({
    where: { address },
    update: { isWatched: true, ...(label ? { label } : {}) },
    create: { address, label, isWatched: true },
  });

  console.log(`Wallet ${wallet.address} is now tracked (id ${wallet.id}).`);
  console.log("Run `npm run webhook:sync` to register it with Helius.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
