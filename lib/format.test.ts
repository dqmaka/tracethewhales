import { describe, it, expect } from "vitest";
import { formatUsd, truncateAddress, formatRelativeTime } from "./format";

describe("formatUsd", () => {
  it("shows cents for values under $1 instead of rounding a real trade down to $0", () => {
    // Regression test: a tiny sniper-bot buy (~$0.19) rendered as a flat
    // "$0" before this fix, indistinguishable from an actual zero value.
    expect(formatUsd(0.19)).toBe("$0.19");
  });

  it("rounds to whole dollars for values at or above $1", () => {
    expect(formatUsd(101.37)).toBe("$101");
    expect(formatUsd(15269.9)).toBe("$15,270");
  });

  it("renders exactly zero as a plain $0, not $0.00", () => {
    expect(formatUsd(0)).toBe("$0");
  });
});

describe("truncateAddress", () => {
  it("shortens a long address to front...back", () => {
    expect(truncateAddress("7xKX9v3s6h1a4pQm2f8dRzT9pQm")).toBe("7xKX...9pQm");
  });

  it("leaves short strings untouched", () => {
    expect(truncateAddress("short")).toBe("short");
  });
});

describe("formatRelativeTime", () => {
  it("renders minutes for recent timestamps", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000);
    expect(formatRelativeTime(fiveMinAgo)).toBe("5m ago");
  });

  it("renders hours once past 60 minutes", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000);
    expect(formatRelativeTime(twoHoursAgo)).toBe("2h ago");
  });

  it("renders days once past 24 hours", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60_000);
    expect(formatRelativeTime(threeDaysAgo)).toBe("3d ago");
  });

  it("stays in hours right up to the 24h boundary instead of rounding into days early", () => {
    // Regression test: Math.round(23.6) -> 24, then `hours < 24` was already
    // false, so this used to jump straight to "1d ago".
    const almostOneDayAgo = new Date(Date.now() - (23 * 60 + 40) * 60_000); // 23h40m ago
    expect(formatRelativeTime(almostOneDayAgo)).toBe("23h ago");
  });
});
