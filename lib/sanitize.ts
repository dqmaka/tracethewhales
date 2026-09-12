// Observed live: Vercel's env-var injection silently prepended a UTF-8 BOM
// (U+FEFF) to HELIUS_WEBHOOK_SECRET specifically — the on-disk .env file
// itself was clean, but the deployed process.env value came back one
// character longer, so every real Helius webhook delivery 401'd against a
// secret that could never match (Helius obviously never sends a BOM in its
// Authorization header). Stripping a leading BOM plus incidental whitespace
// before use defends every caller against the same class of "value sourced
// from a file/env picked up a stray character" issue, not just the one
// route that happened to surface it. Kept dependency-free (no node:crypto)
// so it can be imported anywhere — including instrumentation.ts, which Next
// also bundles for the Edge runtime.
export function sanitizeSecret(value: string): string {
  return value.replace(/^﻿/, "").trim();
}
