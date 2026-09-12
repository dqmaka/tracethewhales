import { prisma } from "./prisma";
import { refreshSoloSignalCache, type SoloSignal } from "./solo-signals";
import { sendTelegramMessage, escapeHtml } from "./telegram";
import { formatUsd } from "./format";

// Higher than the buy/exit convergence push bars (60) — a single wallet,
// however proven, has no independent second confirmer, so only push the
// freshest/highest-scoring end of what already qualifies as a solo signal.
const PUSH_MIN_CONVICTION = 65;
const PUSH_COOLDOWN_HOURS = 48; // matches SOLO_SIGNAL_WINDOW_HOURS in lib/solo-signals.ts
const MAX_PUSHES_PER_RUN = 5;

const APP_URL = process.env.APP_URL ?? "https://tracethewhales.vercel.app";

function formatSoloSignalMessage(signal: SoloSignal): string {
  const lines: string[] = [
    `🐳 <b>Whale Conviction Signal: ${escapeHtml(signal.symbol)}</b>`,
    "",
    `Conviction: <b>${signal.convictionScore}</b>/100`,
    `${escapeHtml(signal.wallet.label ?? "Tracked wallet")} (Smart Score ${signal.wallet.score}) bought ${formatUsd(signal.amountUsd)}`,
  ];
  if (signal.liquidityUsd !== null) lines.push(`Liquidity: ${formatUsd(signal.liquidityUsd)}`);
  lines.push("", "⚠️ Single-wallet signal — no independent confirming wallet yet, higher risk than a convergence signal.");
  lines.push("", `${APP_URL}/tokens/${signal.mint}`);
  return lines.join("\n");
}

export interface SoloSignalPushResult {
  pushed: string[];
  skipped: number;
}

/**
 * Pushes newly-qualifying solo whale conviction signals to Telegram —
 * mirrors pushNewSignalsToTelegram in lib/signal-push.ts, but for single-
 * wallet conviction bets. Also the one place that refreshes the solo-signal
 * cache pages read from.
 */
export async function pushSoloSignalsToTelegram(): Promise<SoloSignalPushResult> {
  const signals = await refreshSoloSignalCache();
  const qualifying = signals.filter((s) => s.convictionScore >= PUSH_MIN_CONVICTION).slice(0, MAX_PUSHES_PER_RUN);

  const cooldownCutoff = new Date(Date.now() - PUSH_COOLDOWN_HOURS * 60 * 60 * 1000);
  const pushed: string[] = [];
  let skipped = 0;

  for (const signal of qualifying) {
    const existing = await prisma.pushedSoloSignal.findUnique({ where: { mint: signal.mint } });
    if (existing && existing.pushedAt > cooldownCutoff) {
      skipped++;
      continue;
    }

    try {
      await sendTelegramMessage(formatSoloSignalMessage(signal));
    } catch (err) {
      console.warn(`Telegram solo signal push failed for ${signal.symbol} (${signal.mint}):`, (err as Error).message);
      continue;
    }

    await prisma.pushedSoloSignal.upsert({
      where: { mint: signal.mint },
      update: { pushedAt: new Date() },
      create: { mint: signal.mint, pushedAt: new Date() },
    });
    pushed.push(signal.symbol);
  }

  return { pushed, skipped };
}
