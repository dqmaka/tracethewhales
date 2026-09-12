import Link from "next/link";
import { Radio } from "lucide-react";
import { colors, mono, toneColor } from "./theme";
import { InfoTooltip } from "./InfoTooltip";
import { SectionHeader } from "./SectionHeader";
import { LiveRelativeTime } from "./LiveRelativeTime";
import { truncateAddress } from "@/lib/format";
import type { AlertItem } from "@/lib/dashboard-data";

const ALERT_KIND_EXPLANATIONS: Record<string, string> = {
  "WHALE BUY": "A large, high-conviction buy from a wallet with an already-proven track record (Smart Score 80+).",
  "LARGE TRANSACTION": "A sizeable trade ($2,000+) from a tracked wallet — worth noting, but not from a top-tier wallet or unusually large for it.",
  "NEW WALLET": "The first-ever trade we've recorded for a newly tracked wallet.",
  "UNUSUAL MOVEMENT": "This wallet just traded far above its own normal size (3x+ its recent average) — could mean unusually high conviction.",
  "TOKEN FLOW ALERT": "One token just crossed the threshold of pulling in an outsized share of all tracked wallets' combined buying.",
};

export function LiveAlerts({ alerts }: { alerts: AlertItem[] }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Radio size={13} color={colors.mint} />
        <SectionHeader tooltip="Individual noteworthy events from tracked wallets, detected automatically as they happen — separate from Trade Signals, which need 2+ wallets agreeing on the same token.">
          LIVE ALERTS
        </SectionHeader>
      </div>
      <div>
        {alerts.length === 0 && (
          <div style={{ fontSize: 12.5, color: colors.textFaint, padding: "12px 4px" }}>
            No alerts yet — they&apos;ll appear here once the Helius webhook reports activity for tracked wallets.
          </div>
        )}
        {alerts.map((a, i) => {
          const content = (
            <>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  marginTop: 5,
                  flexShrink: 0,
                  background: toneColor[a.tone],
                  boxShadow: a.important ? `0 0 8px ${toneColor[a.tone]}` : "none",
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.6px", color: toneColor[a.tone], whiteSpace: "nowrap" }}>
                    {a.kind}
                    {ALERT_KIND_EXPLANATIONS[a.kind] && <InfoTooltip text={ALERT_KIND_EXPLANATIONS[a.kind]} />}
                  </span>
                  <span style={{ fontSize: 10.5, color: colors.textFaint }}>
                    <LiveRelativeTime date={a.time} />
                  </span>
                </div>
                <div style={{ fontSize: 12, color: colors.textFaint, fontFamily: mono, marginTop: 2 }}>
                  {truncateAddress(a.wallet)}
                </div>
                <div style={{ fontSize: 12.5, color: colors.text, marginTop: 1 }}>
                  {a.token && <span style={{ fontWeight: 500 }}>{a.token} · </span>}
                  {a.amount ?? "—"}
                </div>
              </div>
            </>
          );

          // tokenMint is null for alerts recorded before this field existed
          // (and for the rare alert with no associated token at all) — those
          // stay a plain, non-clickable row instead of linking nowhere.
          return a.tokenMint ? (
            <Link
              key={i}
              href={`/tokens/${a.tokenMint}`}
              className="ttw4-alert ttw4-alertline"
              style={{ animationDelay: `${i * 0.08}s`, textDecoration: "none", color: "inherit", cursor: "pointer" }}
            >
              {content}
            </Link>
          ) : (
            <div key={i} className="ttw4-alert ttw4-alertline" style={{ animationDelay: `${i * 0.08}s` }}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
