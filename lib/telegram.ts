import { sanitizeSecret } from "./sanitize";

const TELEGRAM_API_BASE = "https://api.telegram.org";

// Observed live: a deployed env var (HELIUS_WEBHOOK_SECRET) picked up a
// stray leading BOM somewhere between the on-disk .env and Vercel's env
// injection, silently breaking every comparison/URL built from it — see
// lib/auth.ts. The bot token feeding straight into the request URL below
// would fail the exact same way (Telegram returning 404 for a garbled bot
// path in the URL), so every env value read here is sanitized on the same
// principle, cheap insurance against the same class of bug recurring.
function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return sanitizeSecret(token);
}

function getChatId(): string {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) throw new Error("TELEGRAM_CHAT_ID is not set");
  return sanitizeSecret(chatId);
}

// Falls back to the public channel so system alerts work immediately with
// zero extra setup — set TELEGRAM_ADMIN_CHAT_ID (a private chat/DM with the
// bot) later to move these off the public channel without any code changes.
function getAdminChatId(): string {
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  return adminChatId ? sanitizeSecret(adminChatId) : getChatId();
}

async function postMessage(chatId: string, text: string): Promise<void> {
  const res = await fetch(`${TELEGRAM_API_BASE}/bot${getBotToken()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendMessage failed: ${res.status} ${res.statusText} — ${body}`);
  }
}

export async function sendTelegramMessage(text: string): Promise<void> {
  await postMessage(getChatId(), text);
}

/** System/ops alerts (e.g. a cron failing repeatedly) — see getAdminChatId. */
export async function sendTelegramAdminAlert(text: string): Promise<void> {
  await postMessage(getAdminChatId(), text);
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
