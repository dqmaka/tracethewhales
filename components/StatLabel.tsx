import type { ReactNode } from "react";
import { colors } from "./theme";
import { InfoTooltip } from "./InfoTooltip";

/**
 * The small caption under every KPI/stat value across the site (e.g. "SMART
 * SCORE", "TRACKED VOLUME") — extracted because the exact same style object
 * was hand-duplicated in ~20+ places. Two variants match the two sizes that
 * already existed in the wild: the default for KPI tiles (Hero, wallet/token
 * detail, performance checkpoints), `compact` for the tighter in-card stats
 * on Signals/Exit-Signals cards.
 */
export function StatLabel({
  children,
  tooltip,
  tooltipAlign,
  compact = false,
}: {
  children: ReactNode;
  tooltip?: string;
  tooltipAlign?: "left" | "right";
  compact?: boolean;
}) {
  return (
    <div
      style={
        compact
          ? { fontSize: 10, color: colors.textFaint, marginTop: 2, whiteSpace: "nowrap" }
          : { fontSize: 10.5, color: colors.textFaint, marginTop: 4, letterSpacing: "0.4px", whiteSpace: "nowrap" }
      }
    >
      {children}
      {tooltip && <InfoTooltip text={tooltip} align={tooltipAlign} />}
    </div>
  );
}
