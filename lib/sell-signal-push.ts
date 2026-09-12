import { prisma } from "./prisma";
import { refreshSellSignalCache, type SellConvergenceSignal } from "./sell-signals";
import { CONVERGENCE_WINDOW_HOURS } from "./signals";
import { sendTelegramMessage, escapeHtml } from "./telegram";
import { formatUsd } from "./format";

// A signal for a token we never flagged as a buy still clears the bar on its
// own merit; one we DID flag always gets pushed regardless of score, since
// anyone who acted on our earlier buy signal deserves to know tracked
// wallets are now heading for the exit — that's a stronger claim on the
// user's attention than an arbitrary score cutoff.
const PUSH_MIN_EXIT_CONVICTION = 60;
const PUSH_COOLDOWN_HOURS = CONVERGENCE_WINDOW_HOURS;
const MAX_PUSHES_PER_RUN = 5;

function formatExitMessage(signal: SellConvergenceSignal): string {
  const lines: string[] = [
    signal.wasPreviouslyPushedAsBuy
      ? `🚪 <b>Exit Signal: ${escapeHtml(signal.symbol)}</b> — a token we previously flagged as a buy`
      : `🚪 <b>Sell-Off Detected: ${escapeHtml(signal.symbol)}</b>`,
    "",
    `${signal.sellerCount} independent tracked wallets sold in the last ${CONVERGENCE_WINDOW_HOURS}h`,
    `Sell volume: ${formatUsd(signal.totalSellUsd)}`,
    `Exit conviction: <b>${signal.exitConvictionScore}</b>/100`,
  ];
  if (signal.liquidityUsd !== null) lines.push(`Liquidity: ${formatUsd(signal.liquidityUsd)}`);
  if (signal.wasPreviouslyPushedAsBuy) {
    lines.push("", "⚠️ If you entered on our earlier signal, tracked wallets are now heading for the exit.");
  }
  return lines.join("\n");
}

export interface SellSignalPushResult {
  pushed: string[];
  skipped: number;
}

/**
 * Pushes newly-qualifying exit signals to Telegram — mirrors
 * pushNewSignalsToTelegram in lib/signal-push.ts, but for sell convergence.
 * Also the one place that refreshes the sell-signal cache pages read from.
 */
export async function pushExitSignalsToTelegram(): Promise<SellSignalPushResult> {
  const signals = await refreshSellSignalCache();
  const qualifying = signals
    .filter((s) => s.wasPreviouslyPushedAsBuy || s.exitConvictionScore >= PUSH_MIN_EXIT_CONVICTION)
    .slice(0, MAX_PUSHES_PER_RUN);

  const cooldownCutoff = new Date(Date.now() - PUSH_COOLDOWN_HOURS * 60 * 60 * 1000);
  const pushed: string[] = [];
  let skipped = 0;

  for (const signal of qualifying) {
    const existing = await prisma.pushedExitSignal.findUnique({ where: { mint: signal.mint } });
    if (existing && existing.pushedAt > cooldownCutoff) {
      skipped++;
      continue;
    }

    try {
      await sendTelegramMessage(formatExitMessage(signal));
    } catch (err) {
      console.warn(`Telegram exit push failed for ${signal.symbol} (${signal.mint}):`, (err as Error).message);
      continue;
    }

    await prisma.pushedExitSignal.upsert({
      where: { mint: signal.mint },
      update: { pushedAt: new Date() },
      create: { mint: signal.mint, pushedAt: new Date() },
    });
    pushed.push(signal.symbol);
  }

  return { pushed, skipped };
}
