"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { colors } from "./theme";

/**
 * Small inline copy-to-clipboard icon for addresses shown truncated
 * everywhere (wallet/token addresses) — previously the only way to get the
 * full address was to follow a link out to Solscan first. Stops the click
 * from bubbling since this is almost always rendered inside a row that's
 * itself a Link (e.g. SignalsPreview, WalletList) — without both
 * preventDefault and stopPropagation, clicking "copy" would also navigate
 * away (same pattern InfoTooltip already uses for the same reason).
 */
export function CopyButton({ value, size = 12 }: { value: string; size?: number }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be unavailable (permissions, non-secure context)
      // — silently do nothing rather than throw in the user's face over a
      // convenience feature.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Copied" : "Copy address"}
      title={copied ? "Copied!" : "Copy address"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size + 8,
        height: size + 8,
        padding: 0,
        marginLeft: 2,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        flexShrink: 0,
        verticalAlign: "middle",
      }}
    >
      {copied ? <Check size={size} color={colors.mint} /> : <Copy size={size} color={colors.textFaint} />}
    </button>
  );
}
