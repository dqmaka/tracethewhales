import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { colors, mono } from "./theme";
import { SectionHeader } from "./SectionHeader";
import { PnlText } from "./PnlText";
import { displaySymbol } from "@/lib/format";
import type { ConvergenceSignal } from "@/lib/signals";

export function SignalsPreview({ signals }: { signals: ConvergenceSignal[] }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <SectionHeader tooltip="Tokens bought by 2+ independent tracked wallets recently — the number in the circle is the Conviction score (0-100, higher = more confirming wallets and/or higher-quality ones). See the full Signals page for details on each.">
          TRADE SIGNALS
        </SectionHeader>
        <Link
          href="/signals"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11.5,
            color: colors.cyan,
            textDecoration: "none",
          }}
        >
          View all <ArrowRight size={12} />
        </Link>
      </div>
      <div>
        {signals.length === 0 && (
          <div style={{ fontSize: 12.5, color: colors.textFaint, padding: "12px 4px" }}>
            No convergence signals right now — they appear once 2+ smart wallets independently buy the same token.
          </div>
        )}
        {signals.map((s) => (
          <Link
            key={s.mint}
            href={`/tokens/${s.mint}`}
            className="ttw4-row"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: mono,
                  fontSize: 10.5,
                  fontWeight: 500,
                  background: "rgba(39,232,255,0.12)",
                  color: colors.cyan,
                }}
              >
                {s.convictionScore}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{displaySymbol(s.symbol, s.mint)}</div>
                <div style={{ fontSize: 11, color: colors.textFaint, marginTop: 2 }}>
                  {s.walletCount} independent wallets
                </div>
              </div>
            </div>
            {s.priceChangeSinceTriggerPercent !== null ? (
              <div style={{ flexShrink: 0 }}>
                <PnlText value={s.priceChangeSinceTriggerPercent} size={13} showArrow />
              </div>
            ) : (
              <div style={{ fontFamily: mono, fontSize: 13, color: colors.textFaint }}>—</div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
