import { colors, mono } from "./theme";
import { SectionHeader } from "./SectionHeader";
import { StatLabel } from "./StatLabel";
import type { RecentPerformanceSnapshot } from "@/lib/performance";

/**
 * Homepage-sized readout of "did signals actually work lately" — the share
 * that net-doubled and the median net outcome, both measured at the 48h
 * checkpoint for signals pushed in the last 30 days. See
 * computeRecentPerformanceSnapshot for the cost model (slippage, gas, and
 * the 90s-delayed entry price) baked into these numbers.
 */
export function SignalPerformanceSnapshot({ snapshot }: { snapshot: RecentPerformanceSnapshot }) {
  return (
    <section
      style={{
        borderRadius: 20,
        padding: "18px 22px",
        background: colors.panelSoft,
        border: `1px solid ${colors.line}`,
        margin: "20px 0",
      }}
    >
      <SectionHeader
        style={{ marginBottom: 12 }}
        tooltip="How pushed signals actually performed over the last 30 days, net of 1.5% slippage per side and gas costs, measured from a simulated entry 90s after the signal fired (not its exact push-instant price) through the 48h checkpoint."
      >
        30D SIGNAL PERFORMANCE
      </SectionHeader>
      {snapshot.sampleSize === 0 ? (
        <div style={{ fontSize: 12.5, color: colors.textFaint }}>
          No signals have completed their 48h tracking window in the last 30 days yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 28, alignItems: "flex-end" }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 500, color: colors.mint }}>
              {snapshot.over2xPercent}%
            </div>
            <StatLabel tooltip="Share of signals pushed in the last 30 days (with a completed 48h reading) whose net-of-cost performance reached at least +100% (2x) by then.">
              SIGNALS OVER 2X
            </StatLabel>
          </div>
          <div>
            <div
              style={{
                fontFamily: mono,
                fontSize: 22,
                fontWeight: 500,
                color: (snapshot.medianChangePercent ?? 0) >= 0 ? colors.mint : colors.coral,
              }}
            >
              {snapshot.medianChangePercent !== null
                ? `${snapshot.medianChangePercent >= 0 ? "+" : ""}${snapshot.medianChangePercent}%`
                : "—"}
            </div>
            <StatLabel tooltip="Median net-of-cost performance at the 48h checkpoint across the same signals — half did better, half did worse. Less skewed by one outlier than an average would be.">
              MEDIAN PERFORMANCE
            </StatLabel>
          </div>
          <div style={{ fontSize: 10.5, color: colors.textFaint }}>n={snapshot.sampleSize}</div>
        </div>
      )}
    </section>
  );
}
