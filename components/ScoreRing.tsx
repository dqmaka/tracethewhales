import { colors, mono } from "./theme";

/** Same three-tier read as the rest of the app's score coloring (e.g.
 * ScoreBar's mint-above-85 cutoff) — a bit more granular here since the ring
 * itself is the main visual, not just an accent next to a bar. */
function ringColor(score: number): string {
  if (score >= 70) return colors.mint;
  if (score >= 40) return colors.cyan;
  return colors.coral;
}

/**
 * Radial progress ring around a 0-100 score — replaces a flat colored
 * number with something scannable at a glance across a list (a mostly-full
 * vs. mostly-empty ring reads faster than comparing two-digit numbers).
 * Pure SVG, no client-side JS needed.
 */
export function ScoreRing({
  score,
  size = 40,
  strokeWidth = 3,
  fontSize,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
  fontSize?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const dash = (clamped / 100) * circumference;
  const color = ringColor(clamped);

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: mono,
          fontSize: fontSize ?? Math.round(size * 0.34),
          fontWeight: 500,
          color,
        }}
      >
        {Math.round(clamped)}
      </div>
    </div>
  );
}
