import { NextRequest, NextResponse } from "next/server";
import { discoverSmartMoneyWallets } from "@/lib/discovery";
import { rescoreWatchedWallets } from "@/lib/rescoring";
import { updateWalletDiscoveryOutcomes } from "@/lib/wallet-outcomes";
import { timingSafeStringEqual } from "@/lib/auth";
import { recordCronSuccess, recordCronFailure } from "@/lib/cron-health";

export const maxDuration = 60;
const JOB_NAME = "discover-wallets";
// cron-job.org's own external wait cap is 30s (not Vercel's, see
// DISCOVERY_TIME_BUDGET_MS in discovery.ts) — discovery's own budget is only
// checked *between* batches, so a heavier-than-usual run can already land
// close to that ceiling before rescoring ever starts (observed live: 28.7s
// total for one run). Only spend time on rescoring if there's real margin
// left, and cap it well short of the ceiling either way.
const SAFE_TOTAL_BUDGET_MS = 22_000;
const MAX_RESCORE_BUDGET_MS = 5_000;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  // Fail closed: an unset secret must never mean "accept everything".
  if (!secret) {
    console.error("CRON_SECRET is not set — refusing cron request");
    return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
  }
  if (!timingSafeStringEqual(req.headers.get("authorization"), `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const result = await discoverSmartMoneyWallets();
    await recordCronSuccess(JOB_NAME);

    // Independent of discovery itself succeeding — a rescoring hiccup
    // shouldn't count against this cron's own health/failure alerting.
    let rescore: Awaited<ReturnType<typeof rescoreWatchedWallets>> | null = null;
    const remainingBudget = SAFE_TOTAL_BUDGET_MS - (Date.now() - startedAt);
    if (remainingBudget > 1_000) {
      try {
        rescore = await rescoreWatchedWallets(Math.min(remainingBudget, MAX_RESCORE_BUDGET_MS));
      } catch (err) {
        console.warn("rescoreWatchedWallets failed:", (err as Error).message);
      }
    }

    // Pure DB reads (no external API) — cheap enough to run every tick
    // regardless of how much time discovery/rescoring already used.
    let walletOutcomes: Awaited<ReturnType<typeof updateWalletDiscoveryOutcomes>> | null = null;
    try {
      walletOutcomes = await updateWalletDiscoveryOutcomes();
    } catch (err) {
      console.warn("updateWalletDiscoveryOutcomes failed:", (err as Error).message);
    }

    return NextResponse.json({ ...result, rescore, walletOutcomes });
  } catch (err) {
    await recordCronFailure(JOB_NAME, err as Error);
    return NextResponse.json({ error: "Discovery failed" }, { status: 500 });
  }
}
