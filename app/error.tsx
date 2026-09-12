"use client";

import { colors, mono } from "@/components/theme";

// Route-segment error boundary — catches a render/data-fetch error in a
// single page without taking down the rest of the app. The error itself is
// already reported server-side via instrumentation.ts's onRequestError;
// this is purely the user-facing fallback.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        textAlign: "center",
        color: colors.text,
      }}
    >
      <div style={{ fontFamily: mono, fontSize: 14, color: colors.coral, letterSpacing: 1 }}>
        SOMETHING WENT WRONG
      </div>
      <div style={{ color: colors.textDim, maxWidth: 420 }}>
        This page hit an unexpected error. It&apos;s already been flagged — try again in a moment.
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
    </div>
  );
}
