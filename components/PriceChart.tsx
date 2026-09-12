import { colors } from "./theme";
import type { TokenPricePoint, TokenTradeMarker } from "@/lib/dashboard-data";

const W = 680;
const H = 160;
const PAD = 8;

export function PriceChart({ points, markers }: { points: TokenPricePoint[]; markers?: TokenTradeMarker[] }) {
  if (points.length < 2) {
    return (
      <div style={{ fontSize: 12.5, color: colors.textFaint, padding: "12px 4px" }}>
        No price history available.
      </div>
    );
  }

  const values = points.map((p) => p.value);
  const times = points.map((p) => p.time);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const minT = Math.min(...times);
  const maxT = Math.max(...times);

  const x = (t: number) => PAD + ((t - minT) / (maxT - minT || 1)) * (W - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - minV) / (maxV - minV || 1)) * (H - PAD * 2);

  const nearestY = (t: number) => {
    let closest = points[0];
    let minDiff = Math.abs(points[0].time - t);
    for (const p of points) {
      const diff = Math.abs(p.time - t);
      if (diff < minDiff) {
        minDiff = diff;
        closest = p;
      }
    }
    return y(closest.value);
  };

  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.time).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const lastX = x(points[points.length - 1].time).toFixed(1);
  const firstX = x(points[0].time).toFixed(1);
  const areaD = `${d} L${lastX},${H - PAD} L${firstX},${H - PAD} Z`;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }} aria-hidden="true">
      <defs>
        <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colors.cyan} stopOpacity="0.22" />
          <stop offset="100%" stopColor={colors.cyan} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#priceFill)" stroke="none" />
      <path d={d} fill="none" stroke={colors.cyan} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      {markers?.map((m, i) => {
        const t = Math.floor(m.occurredAt.getTime() / 1000);
        if (t < minT || t > maxT) return null; // trade happened outside the shown price window
        return (
          <circle
            key={i}
            cx={x(t)}
            cy={nearestY(t)}
            r="4"
            fill={m.type === "BUY" ? colors.mint : colors.coral}
            stroke={colors.bg}
            strokeWidth="1.5"
          />
        );
      })}
    </svg>
  );
}
