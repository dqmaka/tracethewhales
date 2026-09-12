import { NextRequest, NextResponse } from "next/server";
import { pushNewSignalsToTelegram } from "@/lib/signal-push";
import { pushExitSignalsToTelegram } from "@/lib/sell-signal-push";
import { pushSoloSignalsToTelegram } from "@/lib/solo-signal-push";
import { updateSignalOutcomes } from "@/lib/signal-outcomes";
import { timingSafeStringEqual } from "@/lib/auth";
import { recordCronSuccess, recordCronFailure } from "@/lib/cron-health";

export const maxDuration = 30;
const JOB_NAME = "push-signals";

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

  try {
    const result = await pushNewSignalsToTelegram();
    await recordCronSuccess(JOB_NAME);

    // Independent of the buy-side push succeeding — a hiccup in either of
    // these shouldn't count against this cron's own health/failure alerting.
    try {
      await updateSignalOutcomes();
    } catch (err) {
      console.warn("updateSignalOutcomes failed:", (err as Error).message);
    }

    let exitResult: Awaited<ReturnType<typeof pushExitSignalsToTelegram>> | null = null;
    try {
      exitResult = await pushExitSignalsToTelegram();
    } catch (err) {
      console.warn("pushExitSignalsToTelegram failed:", (err as Error).message);
    }

    let soloResult: Awaited<ReturnType<typeof pushSoloSignalsToTelegram>> | null = null;
    try {
      soloResult = await pushSoloSignalsToTelegram();
    } catch (err) {
      console.warn("pushSoloSignalsToTelegram failed:", (err as Error).message);
    }

    return NextResponse.json({ ...result, exit: exitResult, solo: soloResult });
  } catch (err) {
    await recordCronFailure(JOB_NAME, err as Error);
    return NextResponse.json({ error: "Signal push failed" }, { status: 500 });
  }
}
