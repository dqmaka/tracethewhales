import { prisma } from "./prisma";
import { getTokenOverview } from "./dexscreener";

export async function upsertToken(mint: string) {
  const existing = await prisma.token.findUnique({ where: { mint } });
  if (existing) return existing;

  // DexScreener (free, no quota) is the source for the human-readable
  // symbol; fall back to the mint itself so an outage never blocks
  // ingestion — it's guaranteed unique (Token.mint already is), unlike a
  // truncated prefix, which two different mints can share.
  let symbol = mint;
  let name: string | undefined;
  try {
    const overview = await getTokenOverview(mint);
    symbol = overview.symbol || symbol;
    name = overview.name;
  } catch {}

  return prisma.token.upsert({
    where: { mint },
    update: {},
    create: { mint, symbol, name },
  });
}
