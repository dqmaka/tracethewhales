import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { colors, mono } from "./theme";
import { Sparkline } from "./Sparkline";
import { ScoreBar } from "./ScoreBar";
import { SectionHeader } from "./SectionHeader";
import { PnlText } from "./PnlText";
import { truncateAddress } from "@/lib/format";
import type { WalletRow } from "@/lib/dashboard-data";

export function WalletList({ wallets }: { wallets: WalletRow[] }) {
  return (
    <div>
      <SectionHeader
        tooltip="Wallets we actively track because their past trading has looked genuinely skilled, not automated or lucky by chance. Ranked by Smart Score. Click a wallet to see its full history."
        style={{ marginBottom: 10 }}
      >
        TOP SMART MONEY
      </SectionHeader>
      <div>
        {wallets.map((w) => (
          <Link
            key={w.address}
            href={`/wallets/${w.address}`}
            className="ttw4-row"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <svg width="26" height="26" viewBox="0 0 26 26" style={{ flexShrink: 0 }} aria-hidden="true">
                <path
                  d="M3 15 C4 9 9 6 14 6 C19 6 23 9 25 12 C22 11 20 12 19 14 C21 15 22 17 23 19 C20 19 18 17 17 16 C14 20 8 21 4 18 Z"
                  fill="none"
                  stroke={w.pnl >= 0 ? colors.cyan : colors.coral}
                  strokeWidth="1.2"
                  opacity="0.85"
                />
              </svg>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{w.label ?? truncateAddress(w.address)}</div>
                <div style={{ fontSize: 11, color: colors.textFaint, fontFamily: mono, marginBottom: 3 }}>
                  {truncateAddress(w.address)}
                </div>
                <ScoreBar score={w.score} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
              <Sparkline data={w.spark} positive={w.pnl >= 0} />
              <div style={{ display: "flex", justifyContent: "flex-end", minWidth: 68 }}>
                <PnlText
                  value={w.pnl}
                  size={13}
                  showArrow
                  tooltipAlign="right"
                  tooltip="This wallet's own realized profit/loss over the last 30 days — not a prediction of what would happen if you copied its trades today."
                />
              </div>
              <ChevronRight size={14} color={colors.textFaint} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
