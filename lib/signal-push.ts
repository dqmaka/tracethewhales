import { prisma } from "./prisma";
import { refreshSignalCache, CONVERGENCE_WINDOW_HOURS, type ConvergenceSignal } from "./signals";
import { sendTelegramMessage, sendTelegramAdminAlert, escapeHtml } from "./telegram";
import { formatUsd } from "./format";
import { recordSignalPush } from "./signal-outcomes";

// Below this, a signal isn't confirmed enough to be worth interrupting
// someone's day over — still visible on the /signals page, just not pushed.
const PUSH_MIN_CONVICTION = 60;
// 60-74 clears the bar but isn't a strong call — say so in the message
// instead of presenting every push with the same confidence.
const PUSH_MODERATE_CONVICTION_CEILING = 74;
// Matches the convergence window itself: once a signal's most recent buy
// ages out of that window it naturally drops off /signals anyway, so this is
// the point where a fresh reappearance is genuinely new news again, not a
// repeat of the same push.
const PUSH_COOLDOWN_HOURS = CONVERGENCE_WINDOW_HOURS;
// Safety cap — the cooldown logic should mean this rarely bites, but guards
// against a burst of newly-qualifying signals flooding the channel in one run.
const MAX_PUSHES_PER_RUN = 5;

const APP_URL = process.env.APP_URL ?? "https://tracethewhales.vercel.app";

function formatSignalMessage(signal: ConvergenceSignal): string {
  const priceLine =
    signal.priceChangeSinceTriggerPercent !== null
      ? `Price: ${signal.priceChangeSinceTriggerPercent >= 0 ? "+" : ""}${signal.priceChangeSinceTriggerPercent}% since first buy`
      : "Price change since first buy: unknown";

  const lines: string[] = [
    `🐋 <b>New Trade Signal: ${escapeHtml(signal.symbol)}</b>`,
    "",
    `Conviction: <b>${signal.convictionScore}</b>/100`,
    `${signal.walletCount} independent wallets bought in the last ${CONVERGENCE_WINDOW_HOURS}h`,
    `Buy volume: ${formatUsd(signal.totalBuyUsd)}`,
  ];
  if (signal.liquidityUsd !== null) lines.push(`Liquidity: ${formatUsd(signal.liquidityUsd)}`);
  lines.push(priceLine);

  if (signal.convictionScore <= PUSH_MODERATE_CONVICTION_CEILING) {
    lines.push("", "⚠️ Moderate conviction — do your own research before acting.");
  }
  for (const flag of signal.riskFlags) {
    lines.push(`⚠️ ${escapeHtml(flag.message)}`);
  }

  lines.push("", `${APP_URL}/tokens/${signal.mint}`);
  return lines.join("\n");
}

export interface SignalPushResult {
  pushed: string[];
  skipped: number;
}

/**
 * Pushes newly-qualifying convergence signals to the Telegram channel —
 * "newly" meaning not already pushed within PUSH_COOLDOWN_HOURS, so the same
 * still-active signal doesn't get reposted on every cron tick. Also the one
 * place that refreshes the signal cache pages read from (see
 * refreshSignalCache in lib/signals.ts) — this run already needs the full
 * live computation to decide what to push, so it's the natural point to pay
 * that cost once instead of on every page load too.
 */
export async function pushNewSignalsToTelegram(): Promise<SignalPushResult> {
  const signals = await refreshSignalCache();
  const qualifying = signals
    .filter((s) => s.convictionScore >= PUSH_MIN_CONVICTION)
    .slice(0, MAX_PUSHES_PER_RUN);

  const cooldownCutoff = new Date(Date.now() - PUSH_COOLDOWN_HOURS * 60 * 60 * 1000);
  const pushed: string[] = [];
  let skipped = 0;

  for (const signal of qualifying) {
    const existing = await prisma.pushedSignal.findUnique({ where: { mint: signal.mint } });
    if (existing && existing.pushedAt > cooldownCutoff) {
      skipped++;
      continue;
    }

    try {
      await sendTelegramMessage(formatSignalMessage(signal));
    } catch (err) {
      console.warn(`Telegram push failed for ${signal.symbol} (${signal.mint}):`, (err as Error).message);
      continue;
    }

    await prisma.pushedSignal.upsert({
      where: { mint: signal.mint },
      update: { pushedAt: new Date() },
      create: { mint: signal.mint, pushedAt: new Date() },
    });
    try {
      await recordSignalPush(signal);
    } catch (err) {
      // A tracking-row failure shouldn't be treated as the push itself
      // failing — the Telegram message already went out. But swallowing it
      // as a plain warning meant this could break completely (observed live:
      // 0 SignalOutcome rows ever, despite 7 signals having pushed fine)
      // without anyone noticing — error-level log plus a Telegram admin
      // alert, mirroring how a repeatedly-failing cron already alerts (see
      // lib/cron-health.ts). Never lets the alert itself throw past here.
      console.error(`Failed to record outcome tracking for ${signal.symbol} (${signal.mint}):`, err);
      try {
        await sendTelegramAdminAlert(
          `⚠️ <b>Signal outcome tracking failed</b> for ${escapeHtml(signal.symbol)} — the Telegram push went out, ` +
            `but its performance won't be tracked.\nError: ${escapeHtml((err as Error).message)}`
        );
      } catch (alertErr) {
        console.error("Failed to send outcome-tracking-failure alert:", (alertErr as Error).message);
      }
    }
    pushed.push(signal.symbol);
  }

  return { pushed, skipped };
}
