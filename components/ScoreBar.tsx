import { colors, mono } from "./theme";
import { InfoTooltip } from "./InfoTooltip";

export function ScoreBar({ score }: { score: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 10.5, color: colors.textFaint, letterSpacing: "0.4px", whiteSpace: "nowrap" }}>
        SCORE
        <InfoTooltip text="0-100 rating of how trustworthy this wallet's trading looks: how active it is, how consistent its position sizes are, how often it actually closes trades (not just paper gains), and how diverse its trades are — combined with its real profit history. Automated bot patterns (identical tiny buys, suspiciously regular timing, instant flips) pull this score down. Re-checked periodically, not fixed forever." />
      </span>
      <span style={{ fontFamily: mono, fontSize: 12.5, color: colors.text }}>{score}</span>
      <div
        style={{
          width: 28,
          height: 3,
          borderRadius: 999,
          background: "rgba(255,255,255,0.08)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${score}%`,
            height: "100%",
            background: score >= 85 ? colors.mint : colors.cyan,
          }}
        />
      </div>
    </div>
  );
}
