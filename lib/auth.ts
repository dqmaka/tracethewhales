import { timingSafeEqual } from "node:crypto";
import { sanitizeSecret } from "./sanitize";

// Re-exported for existing callers/tests — the implementation itself lives
// in lib/sanitize.ts, kept free of the node:crypto import below so it can
// also be imported from instrumentation.ts (bundled for the Edge runtime
// too, which doesn't support node:crypto).
export { sanitizeSecret };

/**
 * Constant-time string comparison for secrets (webhook/cron auth headers).
 * A plain `!==` leaks how many leading characters matched via response
 * timing — low real-world risk here, but free to close off. The length
 * check runs first (timingSafeEqual throws on mismatched lengths); that
 * itself leaks length, which is standard practice and far less sensitive
 * than leaking content.
 */
export function timingSafeStringEqual(a: string | null, b: string): boolean {
  if (a === null) return false;
  const bufA = Buffer.from(sanitizeSecret(a));
  const bufB = Buffer.from(sanitizeSecret(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
