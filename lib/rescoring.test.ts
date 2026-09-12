import { describe, it, expect } from "vitest";
import { shouldStayWatched, selectRescoreBatch, type RescoreCandidate } from "./rescoring";

function candidate(overrides: Partial<RescoreCandidate> = {}): RescoreCandidate {
  return {
    address: "Wallet1111111111111111111111111111111111",
    lastRescoredAt: new Date(),
    ...overrides,
  };
}

describe("shouldStayWatched", () => {
  it("stays watched when the wallet qualifies", () => {
    expect(shouldStayWatched(true, true)).toBe(true);
  });

  it("unwatches a wallet that genuinely fails to qualify with a verified PnL check", () => {
    expect(shouldStayWatched(false, true)).toBe(false);
  });

  it("regression: does NOT unwatch a wallet when PnL couldn't be verified (e.g. Birdeye outage) " +
    "even though behaviorScore alone said it doesn't qualify", () => {
    // This is the exact bug from the first live run: Birdeye's quota was
    // exhausted, every rescored wallet's PnL check failed, and treating
    // that failure as "proven bad" mass-unwatched every one of them.
    expect(shouldStayWatched(false, false)).toBe(true);
  });

  it("stays watched if it qualifies even when PnL itself couldn't be verified", () => {
    expect(shouldStayWatched(true, false)).toBe(true);
  });
});

describe("selectRescoreBatch", () => {
  it("puts a priority wallet ahead of a more-stale non-priority wallet", () => {
    const stale = candidate({ address: "Stale", lastRescoredAt: new Date("2020-01-01") });
    const priority = candidate({ address: "Priority", lastRescoredAt: new Date("2025-01-01") });
    const result = selectRescoreBatch([stale, priority], new Set(["Priority"]), 5);
    expect(result.map((c) => c.address)).toEqual(["Priority", "Stale"]);
  });

  it("orders the priority group itself oldest-rescored-first", () => {
    const newer = candidate({ address: "Newer", lastRescoredAt: new Date("2025-06-01") });
    const older = candidate({ address: "Older", lastRescoredAt: new Date("2024-01-01") });
    const result = selectRescoreBatch([newer, older], new Set(["Newer", "Older"]), 5);
    expect(result.map((c) => c.address)).toEqual(["Older", "Newer"]);
  });

  it("fills remaining slots from non-priority wallets once the priority group is exhausted", () => {
    const priorityWallet = candidate({ address: "P", lastRescoredAt: new Date("2025-01-01") });
    const rest = ["R1", "R2", "R3"].map((address, i) =>
      candidate({ address, lastRescoredAt: new Date(2024, 0, i + 1) })
    );
    const result = selectRescoreBatch([priorityWallet, ...rest], new Set(["P"]), 3);
    expect(result).toHaveLength(3);
    expect(result[0].address).toBe("P");
    expect(result.slice(1).map((c) => c.address)).toEqual(["R1", "R2"]); // oldest two of the non-priority rest
  });

  it("treats never-rescored (null lastRescoredAt) as oldest within its tier", () => {
    const rescored = candidate({ address: "Rescored", lastRescoredAt: new Date() });
    const neverRescored = candidate({ address: "Never", lastRescoredAt: null });
    const result = selectRescoreBatch([rescored, neverRescored], new Set(), 5);
    expect(result.map((c) => c.address)).toEqual(["Never", "Rescored"]);
  });

  it("never returns more than batchSize even with plenty of candidates", () => {
    const candidates = Array.from({ length: 10 }, (_, i) => candidate({ address: `W${i}` }));
    const result = selectRescoreBatch(candidates, new Set(), 5);
    expect(result).toHaveLength(5);
  });

  it("falls back to pure oldest-first order when there are no priority wallets at all", () => {
    const older = candidate({ address: "Older", lastRescoredAt: new Date("2024-01-01") });
    const newer = candidate({ address: "Newer", lastRescoredAt: new Date("2025-01-01") });
    const result = selectRescoreBatch([newer, older], new Set(), 5);
    expect(result.map((c) => c.address)).toEqual(["Older", "Newer"]);
  });
});
