import { colors } from "./theme";

export function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  const w = 64;
  const h = 22;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1 || 1)) * w;
    const y = h - ((v - min) / (max - min || 1)) * h;
    return [x, y];
  });
  const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");

  return (
    <svg width={w} height={h} className="ttw4-spark" aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke={positive ? colors.mint : colors.coral}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength="340"
        strokeDasharray="340"
      />
    </svg>
  );
}
