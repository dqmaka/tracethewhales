import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { extractNetWalletTrades, type NetWalletTrade } from "@/lib/wallet-activity";
import { upsertToken } from "@/lib/tokens";
import { maybeCreateAlert, maybeCreateTokenFlowAlert, UNUSUAL_MOVEMENT_MIN_SAMPLE } from "@/lib/alerts";
import type { HeliusEnhancedTransaction } from "@/lib/helius";
import { timingSafeStringEqual } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const secret = process.env.HELIUS_WEBHOOK_SECRET;
  // Fail closed: an unset secret must never mean "accept everything" — it
  // means the webhook isn't configured yet. syncHeliusWebhook() always
  // generates and persists one before ever registering with Helius, so this
  // should only trip if the env var was lost/misconfigured.
  if (!secret) {
    console.error("HELIUS_WEBHOOK_SECRET is not set — refusing webhook request");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }
  if (!timingSafeStringEqual(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: HeliusEnhancedTransaction[];
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tracked = await prisma.wallet.findMany({ where: { isWatched: true }, select: { address: true } });
  const trackedAddresses = new Set(tracked.map((w) => w.address));

  let recorded = 0;
  for (const tx of payload) {
    const trades = await extractNetWalletTrades(tx, trackedAddresses);
    for (const trade of trades) {
      try {
        if (await recordTrade(trade)) recorded += 1;
      } catch (err) {
        // Isolate one bad trade from the rest of the batch — Helius can
        // (and does) pack many trades into one delivery, and a single
        // unexpected failure here previously threw the whole request into a
        // 500, which likely made Helius redeliver the entire payload,
        // including trades that had already been recorded further up the
        // loop (see recordTrade's own P2002 handling for why that redelivery
        // is now safe on its own, but there's no reason to also block
        // every *other* trade in the same batch over one bad one).
        console.error(
          `Failed to record trade (${trade.signature}, ${trade.mint}, ${trade.walletAddress}):`,
          (err as Error).message
        );
      }
    }
  }

  return NextResponse.json({ ok: true, transactionsReceived: payload.length, tradesRecorded: recorded });
}

/** Returns true iff this call is the one that actually inserted the row —
 * false for a trade that was already recorded (see the P2002 catch below).
 * Alerts only fire on a genuine new insert, so a redelivered/duplicate
 * webhook can't double-fire them. */
async function recordTrade(trade: NetWalletTrade): Promise<boolean> {
  const wallet = await prisma.wallet.upsert({
    where: { address: trade.walletAddress },
    update: {},
    create: { address: trade.walletAddress },
  });

  const token = await upsertToken(trade.mint);
  const priorStats = await prisma.transaction.aggregate({
    where: { walletId: wallet.id },
    _count: true,
    _avg: { amountUsd: true },
  });
  const txHash = `${trade.signature}-${trade.mint}-${trade.walletAddress}`;

  try {
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
  } catch (err) {
    // Observed live: Helius can redeliver the same transaction (its own
    // retry, or two overlapping deliveries), racing a second request against
    // this exact txHash before the first has committed — an upsert's
    // `where: { txHash }` guards against updating the wrong row, not against
    // this insert race, so P2002 here means "already recorded a moment ago
    // by a concurrent/duplicate delivery", not a real failure.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return false;
    }
    throw err;
  }

  await maybeCreateAlert(wallet, token.symbol, token.mint, trade, {
    isFirstEverTransaction: priorStats._count === 0,
    priorAvgAmountUsd: priorStats._count >= UNUSUAL_MOVEMENT_MIN_SAMPLE ? priorStats._avg.amountUsd : null,
  });
  await maybeCreateTokenFlowAlert(wallet, token.id, token.symbol, token.mint, trade);
  return true;
}
