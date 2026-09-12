"use client";

import { colors, mono } from "@/components/theme";

// Only fires when the error is in the root layout itself (so it must render
// its own <html>/<body> — the normal layout can't be trusted to still work).
// Same as app/error.tsx: the error is reported server-side via
// instrumentation.ts, this is just the fallback UI.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          textAlign: "center",
          background: colors.bg,
          color: colors.text,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontFamily: mono, fontSize: 14, color: colors.coral, letterSpacing: 1 }}>
          SOMETHING WENT WRONG
        </div>
        <div style={{ color: colors.textDim, maxWidth: 420 }}>
          The app hit an unexpected error. It&apos;s already been flagged — try again in a moment.
        </div>
        <button
          onClick={() => reset()}
          style={{
            fontFamily: mono,
            fontSize: 13,
            padding: "8px 16px",
            borderRadius: 8,
            border: `1px solid ${colors.lineStrong}`,
            background: colors.panel,
            color: colors.text,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
