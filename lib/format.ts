/** Rounding small values to whole dollars makes real (if tiny) trades read as
 * "$0" — e.g. a $0.19 sniper-bot buy. Show cents under $1. */
export function formatUsd(value: number): string {
  const fractionDigits = Math.abs(value) < 1 && value !== 0 ? 2 : 0;
  return `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: fractionDigits }).format(value)}`;
}

export function formatCompactUsd(value: number): string {
  return `$${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
}

export function truncateAddress(address: string, front = 4, back = 4): string {
  if (address.length <= front + back + 3) return address;
  return `${address.slice(0, front)}...${address.slice(-back)}`;
}

/**
 * upsertToken (lib/tokens.ts) falls back to the raw mint address as a
 * token's `symbol` when DexScreener has no name for it yet — correct as a
 * guaranteed-unique internal fallback, but showing the full 44-character
 * address as a "symbol" in the UI reads as broken, especially right next to
 * an already-truncated copy of the same address. Detects exactly that
 * fallback case (symbol === mint) and truncates for display instead.
 */
export function displaySymbol(symbol: string, mint: string): string {
  return symbol === mint ? truncateAddress(mint) : symbol;
}

export function formatRelativeTime(date: Date): string {
  // Floor (not round) throughout: rounding 23.6h up to "24h" then re-testing
  // against `hours < 24` was jumping straight to "1d ago" for anything from
  // ~23.5h onward instead of showing "23h ago" up to the real 24h boundary.
  const minutes = Math.max(1, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
