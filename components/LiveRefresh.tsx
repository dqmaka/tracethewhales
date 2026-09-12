"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { colors } from "./theme";

// How often the page's server data actually gets re-fetched in the
// background (router.refresh() re-runs the server components with fresh DB
// reads — no full navigation, no lost scroll position or client state).
const REFRESH_INTERVAL_MS = 20_000;
// How often the *displayed* "updated Xs ago" text re-renders — much faster
// than the refresh itself, so the counter visibly ticks between refreshes
// instead of jumping in 20s chunks.
const DISPLAY_TICK_MS = 1_000;

/**
 * Sits next to the "LIVE" badge and makes it actually mean something: it
 * periodically refreshes this page's data in the background and shows
 * exactly how long ago that last happened, instead of a pulsing dot that's
 * pure decoration regardless of whether anything's actually current.
 *
 * lastRefreshedAt uses React's lazy-initial-state form (the one sanctioned
 * place to read Date.now() from render) rather than setting it from an
 * effect body — setState called synchronously in an effect triggers an
 * avoidable cascading extra render right after mount.
 */
export function LiveRefresh() {
  const router = useRouter();
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => Date.now());
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    const refreshId = setInterval(() => {
      router.refresh();
      setLastRefreshedAt(Date.now());
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(refreshId);
  }, [router]);

  useEffect(() => {
    const tickId = setInterval(() => {
      setSecondsAgo(Math.max(0, Math.round((Date.now() - lastRefreshedAt) / 1000)));
    }, DISPLAY_TICK_MS);
    return () => clearInterval(tickId);
  }, [lastRefreshedAt]);

  return (
    <span style={{ fontSize: 10.5, color: colors.textFaint, whiteSpace: "nowrap" }}>
      updated {secondsAgo < 1 ? "just now" : `${secondsAgo}s ago`}
    </span>
  );
}
