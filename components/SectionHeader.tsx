import type { CSSProperties, ReactNode } from "react";
import { colors } from "./theme";
import { InfoTooltip } from "./InfoTooltip";

/**
 * The small tracked-letter-spacing caption used above every list/section on
 * the site ("TOP SMART MONEY", "TOKEN FLOWS", "SCORE-BREAKDOWN (LIVE)", ...)
 * — same reasoning as StatLabel: one style object, hand-copied everywhere.
 *
 * `suffix` is for the rare case where a header has a genuinely variable-
 * length trailing bit (e.g. "· Markers = trades by <wallet label>") that
 * must be allowed to wrap on its own rather than forced onto one line with
 * the fixed label + info icon.
 */
export function SectionHeader({
  children,
  tooltip,
  suffix,
  style,
  id,
}: {
  children: ReactNode;
  tooltip?: string;
  suffix?: ReactNode;
  style?: CSSProperties;
  id?: string;
}) {
  return (
    <div id={id} style={{ fontSize: 11.5, letterSpacing: "1.4px", color: colors.textDim, ...style }}>
      <span style={{ whiteSpace: "nowrap" }}>
        {children}
        {tooltip && <InfoTooltip text={tooltip} />}
      </span>
      {suffix}
    </div>
  );
}
