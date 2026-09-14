import Link from "next/link";
import { colors, mono } from "./theme";
import { SectionHeader } from "./SectionHeader";
import { RiskDot } from "./RiskDot";
import { formatUsd, displaySymbol } from "@/lib/format";
import type { FlowItem } from "@/lib/dashboard-data";

export function TokenFlows({ flows }: { flows: FlowItem[] }) {
  return (
    <div>
      <SectionHeader
        style={{ margin: "26px 0 10px" }}
        tooltip="Which tokens tracked wallets are putting the most money into right now, as a share of all their combined buying. Based only on tracked wallets' own trades, not the token's total market activity."
      >
        TOKEN FLOWS
      </SectionHeader>
      <div>
        {flows.length === 0 && (
          <div style={{ fontSize: 12.5, color: colors.textFaint, padding: "12px 4px" }}>
            No transactions recorded yet — token flows will appear once tracked wallets start trading.
          </div>
        )}
        {flows.map((f) => (
          <Link
            key={f.mint}
            href={`/tokens/${f.mint}`}
            className="ttw4-flow"
            style={{ display: "block", textDecoration: "none", color: "inherit" }}
          >
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 13.5, fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}>
                {displaySymbol(f.symbol, f.mint)}
                <RiskDot mintAuthorityActive={f.mintAuthorityActive} freezeAuthorityActive={f.freezeAuthorityActive} />
              </span>
              <span style={{ fontFamily: mono, fontSize: 14, color: colors.mint }}>{f.pct}%</span>
            </div>
            <div style={{ height: 7, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden", marginBottom: 6 }}>
              <div
                style={{
                  width: `${Math.min(f.pct, 100)}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: `linear-gradient(90deg, ${colors.cyan}, ${colors.violet})`,
                  boxShadow: `0 0 10px ${colors.cyan}44`,
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: colors.textFaint }}>
              {formatUsd(f.inflowUsd)} smart money inflow · {f.whales} active whales
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
