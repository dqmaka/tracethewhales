import { sendTelegramAdminAlert, escapeHtml } from "./lib/telegram";

// Per-warm-instance guard against the same error flooding the admin chat on
// every request (e.g. a broken page hit repeatedly) — doesn't dedup across
// separate serverless instances/cold starts, but that's an acceptable gap
// for "don't spam the channel", not a correctness requirement. A genuinely
// persistent bug just alerts again after the next cold start anyway.
const ALERT_COOLDOWN_MS = 10 * 60_000;
const lastAlertedAt = new Map<string, number>();

/**
 * Next.js calls this for any otherwise-unhandled error thrown during
 * rendering, in a Route Handler, Server Action, or Middleware — the one
 * thing that previously only surfaced by someone happening to check Vercel's
 * logs (exactly how today's Telegram/GeckoTerminal bugs were found, hours
 * after they started). Crons already self-report via lib/cron-health.ts;
 * this covers everything else (pages, API routes, webhooks).
 */
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routeType: string }
) {
  const error = err instanceof Error ? err : new Error(String(err));
  const key = `${request.method} ${request.path}: ${error.message}`;
  const now = Date.now();
  const last = lastAlertedAt.get(key);
  if (last && now - last < ALERT_COOLDOWN_MS) return;
  lastAlertedAt.set(key, now);

  try {
    await sendTelegramAdminAlert(
      `🔥 <b>Unhandled error</b> (${escapeHtml(context.routeType)})\n` +
        `${escapeHtml(request.method)} ${escapeHtml(request.path)}\n` +
        `<code>${escapeHtml(error.message)}</code>`
    );
  } catch (alertErr) {
    // Never let alert delivery itself throw — that would mask the original
    // error inside Next.js's own error-handling path.
    console.error("Failed to send error alert:", (alertErr as Error).message);
  }
}
