import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { colors, mono } from "./theme";
import { InfoTooltip } from "./InfoTooltip";

/**
 * A colored +/-X% figure with an optional leading arrow icon and info
 * tooltip — the same "green if positive, coral if negative" percentage
 * shows up on the Wallets list (with an arrow, larger), and on Signals/
 * Exit-Signals per-wallet rows (no arrow, smaller). One component, two call
 * shapes via props, instead of the same color/format logic copied at each size.
 */
export function PnlText({
  value,
  tooltip,
  tooltipAlign,
  size = 10.5,
  showArrow = false,
}: {
  value: number;
  tooltip?: string;
  tooltipAlign?: "left" | "right";
  size?: number;
  showArrow?: boolean;
}) {
  const positive = value >= 0;
  return (
    <span
      style={{
        display: showArrow ? "inline-flex" : "inline",
        alignItems: showArrow ? "center" : undefined,
        gap: showArrow ? 3 : undefined,
        fontFamily: mono,
        fontSize: size,
        color: positive ? colors.mint : colors.coral,
        whiteSpace: "nowrap",
      }}
    >
      {showArrow && (positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />)}
      {positive ? "+" : ""}
      {value}%
      {tooltip && <InfoTooltip text={tooltip} align={tooltipAlign} />}
    </span>
  );
}
