"use client";

import { useEffect, useRef, useState } from "react";
import { formatCompactUsd } from "@/lib/format";

const DEFAULT_DURATION_MS = 900;

/**
 * Animates a numeric KPI counting from its previous value up (or down) to a
 * new one — purely cosmetic (the number is already correct without this),
 * but ties the hero stats to the same "alive" feel as the LIVE badge and
 * pulsing radar dot right next to them. Tweens from the *previous* displayed
 * value, not always from 0 — LiveRefresh re-fetches these numbers every 20s,
 * and resetting to 0 on every refresh just because a stat ticked by one
 * would be a jarring reset-and-rush-back-up on a page that's supposed to
 * feel continuously live, not repeatedly reloading.
 *
 * `format` is a fixed variant name, not a function prop — this component is
 * rendered from a Server Component (Hero.tsx), and a plain function isn't
 * serializable across that boundary (React errors: "Functions cannot be
 * passed directly to Client Components"). Importing the actual formatter
 * here instead keeps the caller server-side-safe.
 */
export function CountUp({
  value,
  format = "number",
  duration = DEFAULT_DURATION_MS,
}: {
  value: number;
  format?: "number" | "compact-usd";
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const prevValue = useRef<number | null>(null);

  useEffect(() => {
    const from = prevValue.current ?? 0;
    prevValue.current = value;
    if (from === value) {
      setDisplay(value);
      return;
    }

    const start = performance.now();
    let frame: number;
    function tick(now: number) {
      const progress = Math.min(1, (now - start) / duration);
      // Ease-out cubic: fast start, gentle settle — reads less mechanical
      // than a plain linear count.
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <>{format === "compact-usd" ? formatCompactUsd(display) : display}</>;
}
