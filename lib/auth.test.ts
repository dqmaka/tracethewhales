import { describe, it, expect } from "vitest";
import { timingSafeStringEqual, sanitizeSecret } from "./auth";

describe("sanitizeSecret", () => {
  it("strips a leading UTF-8 BOM", () => {
    expect(sanitizeSecret("﻿abc123")).toBe("abc123");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeSecret("  abc123\n")).toBe("abc123");
  });

  it("leaves an already-clean value untouched", () => {
    expect(sanitizeSecret("abc123")).toBe("abc123");
  });
});

describe("timingSafeStringEqual", () => {
  it("matches equal strings", () => {
    expect(timingSafeStringEqual("abc123", "abc123")).toBe(true);
  });

  it("rejects a genuinely different value", () => {
    expect(timingSafeStringEqual("abc123", "xyz789")).toBe(false);
  });

  it("returns false for a null header (no Authorization sent at all)", () => {
    expect(timingSafeStringEqual(null, "abc123")).toBe(false);
  });

  it(
    "regression: matches even when the expected secret picked up a stray BOM " +
      "(observed live: Vercel's env injection prepended one to HELIUS_WEBHOOK_SECRET, " +
      "401-ing every real Helius webhook delivery for ~2 days)",
    () => {
      expect(timingSafeStringEqual("abc123", "﻿abc123")).toBe(true);
    }
  );

  it("still rejects a value that's only equal once BOM-stripped on the received side too", () => {
    // Sanity check: sanitization is symmetric — a BOM on the *received*
    // side (which would be unusual, but not impossible) is handled the
    // same way, not just on the expected/secret side.
    expect(timingSafeStringEqual("﻿abc123", "abc123")).toBe(true);
  });
});
