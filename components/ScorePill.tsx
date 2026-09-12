import { colors, mono } from "./theme";
import { InfoTooltip } from "./InfoTooltip";

/**
 * The small rounded "smart score" pill shown next to a wallet in list rows
 * (Signals/Exit-Signals cards) — distinct from the full ScoreBar (which adds
 * a progress bar) used on the Wallets list. Same duplicated style object,
 * now in one place.
 */
export function ScorePill({ score, tooltip }: { score: number; tooltip?: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontFamily: mono,
        color: colors.textDim,
        background: "rgba(255,255,255,0.06)",
        borderRadius: 999,
        padding: "1px 6px",
        whiteSpace: "nowrap",
      }}
    >
      {score}
      {tooltip && <InfoTooltip text={tooltip} />}
    </span>
  );
}
