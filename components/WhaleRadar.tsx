import { colors, mono } from "./theme";

export function WhaleRadar() {
  return (
    <svg viewBox="0 12 600 216" width="100%" style={{ maxHeight: 208, display: "block", overflow: "visible" }} aria-hidden="true">
      <defs>
        <linearGradient id="wg3" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={colors.violet} stopOpacity="0.95" />
          <stop offset="100%" stopColor={colors.cyan} stopOpacity="0.95" />
        </linearGradient>
        <radialGradient id="ambient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={colors.violet} stopOpacity="0.16" />
          <stop offset="100%" stopColor={colors.violet} stopOpacity="0" />
        </radialGradient>
        <filter id="glow3" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <ellipse cx="300" cy="130" rx="220" ry="110" fill="url(#ambient)" />

      <path
        className="ttw4-trace"
        d="M20 158 C60 150 100 140 148 138 C210 108 280 96 350 118 C400 132 440 128 480 112 C520 96 550 92 580 96"
        fill="none"
        stroke={colors.cyan}
        strokeWidth="1.5"
        strokeLinecap="round"
        filter="url(#glow3)"
        opacity="0.9"
      />

      <path
        d="M90 150 C102 100 158 72 228 72 C298 72 356 92 404 120 C424 108 444 106 456 112 C446 120 438 128 434 136 C448 140 460 150 466 162 C448 162 434 158 424 150 C398 170 348 184 286 184 C214 184 130 174 96 156 C90 152 88 152 90 150 Z"
        fill="rgba(139,92,246,0.06)"
        stroke="url(#wg3)"
        strokeWidth="1.4"
      />
      <path
        d="M182 184 C188 202 200 214 214 218 C206 206 202 194 202 184 Z"
        fill="rgba(39,232,255,0.05)"
        stroke="url(#wg3)"
        strokeWidth="1.4"
      />
      <path d="M120 108 C150 96 190 92 224 96" fill="none" stroke={colors.cyan} strokeWidth="0.8" opacity="0.35" />

      <g>
        <circle className="ttw4-node" cx="60" cy="153" r="2.4" fill={colors.cyan} />
        <text x="60" y="140" textAnchor="middle" fontSize="8" fill={colors.textDim} fontFamily={mono}>
          WALLET
        </text>
      </g>
      <g>
        <circle className="ttw4-node" cx="148" cy="138" r="2.6" fill={colors.violet} style={{ animationDelay: "0.4s" }} />
        <text x="148" y="205" textAnchor="middle" fontSize="8" fill={colors.violet} fontFamily={mono}>
          BUY
        </text>
      </g>
      <g>
        <circle className="ttw4-node" cx="350" cy="118" r="2.6" fill={colors.cyan} style={{ animationDelay: "0.9s" }} />
        <text x="350" y="105" textAnchor="middle" fontSize="8" fill={colors.cyan} fontFamily={mono}>
          $48.2K
        </text>
      </g>
      <g>
        <circle className="ttw4-node" cx="480" cy="112" r="2.8" fill={colors.mint} style={{ animationDelay: "1.4s" }} />
        <text x="480" y="99" textAnchor="middle" fontSize="8" fill={colors.mint} fontFamily={mono}>
          +182%
        </text>
      </g>
    </svg>
  );
}
