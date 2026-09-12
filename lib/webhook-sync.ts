import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "./prisma";
import { createWebhook, getWebhook, updateWebhook, listWebhooks } from "./helius";
import { sanitizeSecret } from "./sanitize";

const ENV_PATH = resolve(process.cwd(), ".env");

/**
 * Best-effort convenience for local dev, where persisting the generated
 * secret/webhook ID back to .env means future runs pick it up automatically.
 * On a read-only filesystem (Vercel serverless) this silently no-ops —
 * `syncHeliusWebhook` doesn't depend on the write succeeding.
 */
function tryPersistEnvValue(key: string, value: string) {
  process.env[key] = value;
  try {
    const content = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf-8") : "";
    const line = `${key}="${value}"`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    if (pattern.test(content)) {
      writeFileSync(ENV_PATH, content.replace(pattern, line));
    } else {
      appendFileSync(ENV_PATH, `\n${line}\n`);
    }
  } catch {
    // Read-only filesystem (e.g. Vercel) — nothing to do, env var is already
    // set for the rest of this process.
  }
}

export type WebhookSyncResult =
  | { status: "skipped"; reason: string }
  | { status: "created" | "updated"; webhookId: string; trackedCount: number };

/**
 * Registers (or updates) the Helius webhook to match the wallets currently
 * marked isWatched in the database. Requires APP_URL (a public HTTPS
 * endpoint) — silently skips instead of throwing when the app isn't
 * deployed/tunneled yet, so callers like the discovery job can run without it.
 */
export async function syncHeliusWebhook(): Promise<WebhookSyncResult> {
  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    return { status: "skipped", reason: "APP_URL is not set" };
  }
  if (!process.env.HELIUS_API_KEY) {
    return { status: "skipped", reason: "HELIUS_API_KEY is not set" };
  }

  let secret = process.env.HELIUS_WEBHOOK_SECRET;
  if (!secret) {
    secret = randomBytes(24).toString("hex");
    tryPersistEnvValue("HELIUS_WEBHOOK_SECRET", secret);
  }
  // Same defensive sanitization as timingSafeStringEqual — never register a
  // BOM/whitespace-contaminated value as the authHeader Helius will actually
  // send back to us (see lib/auth.ts for how this bit us live).
  secret = sanitizeSecret(secret);

  const wallets = await prisma.wallet.findMany({
    where: { isWatched: true },
    select: { address: true },
  });
  const accountAddresses = wallets.map((w) => w.address);

  if (accountAddresses.length === 0) {
    return { status: "skipped", reason: "no watched wallets" };
  }

  const webhookURL = `${appUrl.replace(/\/$/, "")}/api/webhooks/helius`;
  const params = {
    webhookURL,
    transactionTypes: ["SWAP"],
    accountAddresses,
    webhookType: "enhanced" as const,
    authHeader: secret,
  };

  const existingId = await resolveExistingWebhookId(webhookURL);
  if (existingId) {
    const updated = await updateWebhook(existingId, params);
    tryPersistEnvValue("HELIUS_WEBHOOK_ID", updated.webhookID);
    return { status: "updated", webhookId: updated.webhookID, trackedCount: accountAddresses.length };
  }

  const created = await createWebhook(params);
  tryPersistEnvValue("HELIUS_WEBHOOK_ID", created.webhookID);
  return { status: "created", webhookId: created.webhookID, trackedCount: accountAddresses.length };
}

/**
 * Prefers the locally-known HELIUS_WEBHOOK_ID (fast path, works when .env
 * persisted it) but falls back to listing Helius's webhooks and matching by
 * URL — needed on serverless, where nothing survives between invocations.
 */
async function resolveExistingWebhookId(webhookURL: string): Promise<string | undefined> {
  const knownId = process.env.HELIUS_WEBHOOK_ID;
  if (knownId) {
    try {
      await getWebhook(knownId);
      return knownId;
    } catch {
      // Stale/deleted ID — fall through to the URL-based lookup below.
    }
  }

  try {
    const all = await listWebhooks();
    return all.find((w) => w.webhookURL === webhookURL)?.webhookID;
  } catch {
    return undefined;
  }
}
