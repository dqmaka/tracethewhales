"use client";

import { useEffect, useState } from "react";
import { formatRelativeTime } from "@/lib/format";

const TICK_MS = 15_000;

/**
 * Client-ticking version of formatRelativeTime — a plain server-rendered
 * "2m ago" freezes at whatever it was when the page loaded until a full
 * reload. This keeps counting itself up in the background so the timestamp
 * visibly moves, reinforcing that the underlying data is actually live.
 */
export function LiveRelativeTime({ date }: { date: Date }) {
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);

  return <>{formatRelativeTime(date)}</>;
}
