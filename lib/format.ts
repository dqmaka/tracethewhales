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
