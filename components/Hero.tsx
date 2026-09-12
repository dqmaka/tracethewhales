import { colors, mono } from "./theme";
import { WhaleRadar } from "./WhaleRadar";
import { StatLabel } from "./StatLabel";
import { PnlText } from "./PnlText";
import { LiveRefresh } from "./LiveRefresh";
import { formatCompactUsd } from "@/lib/format";
import type { DashboardKpis, WalletRow } from "@/lib/dashboard-data";

export function Hero({ kpis, topWallet }: { kpis: DashboardKpis; topWallet?: WalletRow }) {
  return (
    <>
      <section className="ttw4-hero">
        <div className="ttw4-grid-bg" />
        <div style={{ position: "relative", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11.5, letterSpacing: "1.8px", color: colors.textDim, marginBottom: 6 }}>
              SMART MONEY RADAR
            </div>
            <div style={{ fontSize: 21, fontWeight: 500, letterSpacing: "-0.3px" }}>Solana on-chain intelligence</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: colors.mint }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: colors.mint,
                  boxShadow: `0 0 8px ${colors.mint}`,
                  animation: "ttw4pulse 1.6s ease-in-out infinite",
                }}
              />
              LIVE
            </div>
            <LiveRefresh />
          </div>
        </div>

        <div style={{ position: "relative" }}>
          <WhaleRadar />
          {topWallet && (
            <div className="ttw4-chip" style={{ position: "absolute", top: 14, right: 4, textAlign: "right" }}>
              <div style={{ fontSize: 10.5, color: colors.textFaint, letterSpacing: "0.4px" }}>
                {(topWallet.label ?? "WHALE").toUpperCase()} · SCORE {topWallet.score}
              </div>
              <PnlText value={topWallet.pnl} size={12} />
            </div>
          )}
        </div>

        <div className="ttw4-kpis">
          <div className="ttw4-kpi">
            <div
              style={{
                fontFamily: mono,
                fontSize: "clamp(20px,4.2vw,34px)",
                fontWeight: 500,
                color: colors.cyan,
                textShadow: `0 0 16px ${colors.cyan}55`,
                letterSpacing: "-0.5px",
                whiteSpace: "nowrap",
              }}
            >
              {formatCompactUsd(kpis.trackedVolumeUsd)}
            </div>
            <StatLabel>
              TRACKED VOLUME
            </StatLabel>
          </div>
          <div className="ttw4-kpi">
            <div style={{ fontFamily: mono, fontSize: "clamp(16px,2.6vw,22px)", fontWeight: 500, color: colors.text, whiteSpace: "nowrap" }}>
              {kpis.walletsTracked}
            </div>
            <StatLabel>
              WALLETS TRACKED
            </StatLabel>
          </div>
          <div className="ttw4-kpi">
            <div style={{ fontFamily: mono, fontSize: "clamp(16px,2.6vw,22px)", fontWeight: 500, color: colors.mint, whiteSpace: "nowrap" }}>
              {kpis.avgSmartScore}
            </div>
            <StatLabel>
              AVG. SMART SCORE
            </StatLabel>
          </div>
        </div>
      </section>
    </>
  );
}
