import { colors } from "./theme";

/** Simple deterministic string hash (not cryptographic — doesn't need to
 * be) — same address always produces the same pattern/color, different
 * addresses almost always produce visibly different ones. */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

const PALETTE = [colors.cyan, colors.mint, colors.violet, colors.coral];

/**
 * A small, deterministic pattern generated purely from a wallet address —
 * no lookup, no extra data — so long lists of wallets (Wallets page, Signals
 * confirming-wallet rows) get a visually distinct "identity" per row instead
 * of every entry looking the same until you read the truncated address
 * text. Left-right mirrored (classic identicon convention) so the result
 * reads as a deliberate symmetric mark rather than random noise.
 */
export function WalletIdenticon({ address, size = 26 }: { address: string; size?: number }) {
  const hash = hashString(address);
  const color = PALETTE[hash % PALETTE.length];
  const cellSize = size / 3;

  function filled(row: number, col: number): boolean {
    const effectiveCol = col === 2 ? 0 : col; // mirror the last column onto the first
    const bitIndex = row * 3 + effectiveCol;
    return ((hash >> bitIndex) & 1) === 1;
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ borderRadius: 6, flexShrink: 0 }} aria-hidden="true">
      <rect width={size} height={size} rx={6} fill="rgba(255,255,255,0.04)" />
      {[0, 1, 2].flatMap((row) =>
        [0, 1, 2].map((col) =>
          filled(row, col) ? (
            <rect key={`${row}-${col}`} x={col * cellSize} y={row * cellSize} width={cellSize} height={cellSize} fill={color} opacity={0.85} />
          ) : null
        )
      )}
    </svg>
  );
}
