import Link from "next/link";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { NavBar } from "@/components/NavBar";
import { StatLabel } from "@/components/StatLabel";
import { PnlText } from "@/components/PnlText";
import { ScorePill } from "@/components/ScorePill";
import { colors, mono } from "@/components/theme";
import { getCachedConvergenceSignals } from "@/lib/signals";
import { getCachedSellConvergenceSignals } from "@/lib/sell-signals";
import { getCachedSoloConvictionSignals } from "@/lib/solo-signals";
import { formatUsd, truncateAddress, formatRelativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SignalsPage() {
  const signals = await getCachedConvergenceSignals(20);
  const exitSignals = await getCachedSellConvergenceSignals(20);
  const soloSignals = await getCachedSoloConvictionSignals(20);

  return (
    <PageShell>
      <NavBar active="Signals" />
      <div style={{ margin: "24px 0 4px" }}>
        <div style={{ fontSize: 21, fontWeight: 500, letterSpacing: "-0.3px" }}>Trade Signals</div>
        <div style={{ fontSize: 12.5, color: colors.textFaint, marginTop: 4 }}>
          Tokens bought by at least 2 independent tracked smart wallets in the last 48h — ranked by conviction
          (wallet quality × confirmations).
        </div>
      </div>

      {signals.length === 0 && (
        <div style={{ fontSize: 12.5, color: colors.textFaint, padding: "24px 4px" }}>
          No token has been bought by multiple tracked wallets independently in the last 48h right now.
        </div>
      )}

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {signals.map((s) => {
          const alreadyRan = s.priceChangeSinceTriggerPercent !== null && s.priceChangeSinceTriggerPercent > 20;
          return (
            <div
              key={s.mint}
              style={{
                borderRadius: 16,
                padding: "18px 20px",
                background: colors.panelSoft,
                border: `1px solid ${colors.line}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <Link href={`/tokens/${s.mint}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div style={{ fontSize: 16, fontWeight: 500 }}>{s.symbol}</div>
                  <div style={{ fontFamily: mono, fontSize: 11, color: colors.textFaint, marginTop: 3 }}>
                    {truncateAddress(s.mint)}
                  </div>
                </Link>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 500, color: colors.cyan }}>
                    {s.convictionScore}
                  </div>
                  <StatLabel
                    compact
                    tooltipAlign="right"
                    tooltip="0-100 score blending how good/proven the confirming wallets are with how many of them independently agree, adjusted down the longer ago the most recent confirming buy was. Higher = a stronger signal, not a promise."
                  >
                    CONVICTION
                  </StatLabel>
                </div>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginTop: 14 }}>
                <div>
                  <div style={{ fontFamily: mono, fontSize: 14.5 }}>{s.walletCount} wallets</div>
                  <StatLabel compact tooltip="How many separately tracked wallets bought this token in the window — not the same wallet buying multiple times. More independent wallets agreeing is stronger evidence than one wallet buying a lot.">
                    INDEPENDENT BUYERS
                  </StatLabel>
                </div>
                <div>
                  <div style={{ fontFamily: mono, fontSize: 14.5 }}>{formatUsd(s.totalBuyUsd)}</div>
                  <StatLabel compact tooltip="Total dollar amount these confirming wallets bought, combined. Only what our tracked wallets did — not the token's total trading volume from everyone.">
                    TRACKED BUY VOLUME
                  </StatLabel>
                </div>
                <div>
                  <div style={{ fontFamily: mono, fontSize: 14.5 }}>{formatRelativeTime(s.firstBuyAt)}</div>
                  <StatLabel compact tooltip="When the first of the confirming wallets bought this token, within the current 48-hour lookback window.">
                    FIRST BUY IN WINDOW
                  </StatLabel>
                </div>
                <div>
                  <div style={{ fontFamily: mono, fontSize: 14.5, color: colors.mint }}>
                    {formatRelativeTime(s.lastBuyAt)}
                  </div>
                  <StatLabel compact tooltip="When the most recent confirming wallet bought. More recent = the signal is still 'hot'; conviction decays the further back this gets.">
                    LAST CONFIRMING BUY
                  </StatLabel>
                </div>
                <div>
                  {s.priceChangeSinceTriggerPercent !== null ? (
                    alreadyRan ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: mono, fontSize: 14.5, color: colors.coral }}>
                        <ArrowUpRight size={13} />
                        {s.priceChangeSinceTriggerPercent >= 0 ? "+" : ""}
                        {s.priceChangeSinceTriggerPercent}%
                      </span>
                    ) : (
                      <PnlText value={s.priceChangeSinceTriggerPercent} size={14.5} showArrow />
                    )
                  ) : (
                    <div style={{ fontFamily: mono, fontSize: 14.5, color: colors.textFaint }}>—</div>
                  )}
                  <StatLabel compact tooltip="How much the price has moved since that first confirming buy. A big move already means the easy entry may be over — that's what 'late entry' below is warning about.">
                    PRICE SINCE FIRST BUY
                  </StatLabel>
                </div>
                <div>
                  <div style={{ fontFamily: mono, fontSize: 14.5 }}>
                    {s.liquidityUsd !== null ? formatUsd(s.liquidityUsd) : "—"}
                  </div>
                  <StatLabel compact tooltip="How much money is available in the token's trading pool right now. Signals below $50,000 liquidity are excluded entirely — even a great-looking gain isn't real if there isn't enough depth to actually sell into.">
                    LIQUIDITY
                  </StatLabel>
                </div>
              </div>

              {(alreadyRan || s.riskFlags.length > 0) && (
                <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {alreadyRan && (
                    <div
                      style={{
                        fontSize: 10.5,
                        padding: "3px 9px",
                        borderRadius: 999,
                        background: "rgba(255,122,107,0.1)",
                        color: colors.coral,
                      }}
                    >
                      Price has already moved a lot since the first signal buy — late entry
                    </div>
                  )}
                  {s.riskFlags.map((flag) => (
                    <div
                      key={flag.type}
                      style={{
                        fontSize: 10.5,
                        padding: "3px 9px",
                        borderRadius: 999,
                        background:
                          flag.type === "unverified_liquidity" ? "rgba(255,255,255,0.06)" : "rgba(255,122,107,0.1)",
                        color: flag.type === "unverified_liquidity" ? colors.textDim : colors.coral,
                      }}
                    >
                      {flag.message}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 14, borderTop: `1px solid ${colors.line}`, paddingTop: 10 }}>
                {s.wallets.slice(0, 4).map((w) => (
                  <Link
                    key={w.address}
                    href={`/wallets/${w.address}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "5px 0",
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <ScorePill score={w.score} tooltip="This wallet's Smart Score (0-100) — how trustworthy its trading looks, re-checked periodically." />
                      <span style={{ fontSize: 12 }}>{w.label ?? truncateAddress(w.address)}</span>
                      <PnlText value={w.pnl30d} size={10.5} tooltip="This wallet's own realized profit/loss over the last 30 days." />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <span style={{ fontFamily: mono, fontSize: 11.5, color: colors.textFaint, whiteSpace: "nowrap" }}>
                        {formatUsd(w.amountUsd)}
                      </span>
                      <ChevronRight size={12} color={colors.textFaint} />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ margin: "44px 0 4px" }}>
        <div style={{ fontSize: 21, fontWeight: 500, letterSpacing: "-0.3px" }}>Whale Conviction Signals</div>
        <div style={{ fontSize: 12.5, color: colors.textFaint, marginTop: 4 }}>
          A single exceptionally-proven wallet (Smart Score 85+) making an unusually large buy (min. $15,000) — no
          independent second wallet required, so treat these as higher-risk than the convergence signals above.
        </div>
      </div>

      {soloSignals.length === 0 && (
        <div style={{ fontSize: 12.5, color: colors.textFaint, padding: "24px 4px" }}>
          No qualifying single-wallet conviction buy in the last 48h right now.
        </div>
      )}

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {soloSignals.map((s) => (
          <div
            key={s.mint}
            style={{
              borderRadius: 16,
              padding: "18px 20px",
              background: colors.panelSoft,
              border: `1px solid ${colors.line}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <Link href={`/tokens/${s.mint}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ fontSize: 16, fontWeight: 500 }}>{s.symbol}</div>
                <div style={{ fontFamily: mono, fontSize: 11, color: colors.textFaint, marginTop: 3 }}>
                  {truncateAddress(s.mint)}
                </div>
              </Link>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 500, color: colors.violet }}>
                  {s.convictionScore}
                </div>
                <StatLabel
                  compact
                  tooltipAlign="right"
                  tooltip="The wallet's own Smart Score, decayed by how long ago the buy happened. No multi-wallet averaging or headcount bonus here — there's exactly one wallet behind this signal."
                >
                  CONVICTION
                </StatLabel>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginTop: 14 }}>
              <div>
                <div style={{ fontFamily: mono, fontSize: 14.5 }}>{formatUsd(s.amountUsd)}</div>
                <StatLabel compact tooltip="How much this wallet bought of this token in a single position.">
                  BUY SIZE
                </StatLabel>
              </div>
              <div>
                <div style={{ fontFamily: mono, fontSize: 14.5, color: colors.mint }}>
                  {formatRelativeTime(s.buyAt)}
                </div>
                <StatLabel compact tooltip="When this buy happened. More recent = the signal is still 'hot'; conviction decays the further back this gets.">
                  BOUGHT
                </StatLabel>
              </div>
              <div>
                <div style={{ fontFamily: mono, fontSize: 14.5 }}>{s.priceUsd !== null ? formatUsd(s.priceUsd) : "—"}</div>
                <StatLabel compact tooltip="Current price from DexScreener.">
                  PRICE
                </StatLabel>
              </div>
              <div>
                <div style={{ fontFamily: mono, fontSize: 14.5 }}>
                  {s.liquidityUsd !== null ? formatUsd(s.liquidityUsd) : "—"}
                </div>
                <StatLabel compact tooltip="How much money is available in the token's trading pool right now. Signals below $50,000 liquidity are excluded entirely.">
                  LIQUIDITY
                </StatLabel>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  fontSize: 10.5,
                  padding: "3px 9px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.06)",
                  color: colors.textDim,
                  display: "inline-block",
                }}
              >
                Single-wallet signal — no independent confirmation
              </div>
            </div>

            <div style={{ marginTop: 14, borderTop: `1px solid ${colors.line}`, paddingTop: 10 }}>
              <Link
                href={`/wallets/${s.wallet.address}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "5px 0",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <ScorePill score={s.wallet.score} tooltip="This wallet's Smart Score (0-100) — how trustworthy its trading looks, re-checked periodically." />
                  <span style={{ fontSize: 12 }}>{s.wallet.label ?? truncateAddress(s.wallet.address)}</span>
                  <PnlText value={s.wallet.pnl30d} size={10.5} tooltip="This wallet's own realized profit/loss over the last 30 days." />
                </div>
                <ChevronRight size={12} color={colors.textFaint} />
              </Link>
            </div>
          </div>
        ))}
      </div>

      <div style={{ margin: "44px 0 4px" }}>
        <div style={{ fontSize: 21, fontWeight: 500, letterSpacing: "-0.3px" }}>Exit Signals</div>
        <div style={{ fontSize: 12.5, color: colors.textFaint, marginTop: 4 }}>
          Tokens sold by at least 2 independent tracked smart wallets in the last 48h — especially relevant when
          it&apos;s a token we previously flagged as a buy.
        </div>
      </div>

      {exitSignals.length === 0 && (
        <div style={{ fontSize: 12.5, color: colors.textFaint, padding: "24px 4px" }}>
          No token has been sold by multiple tracked wallets independently in the last 48h right now.
        </div>
      )}

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {exitSignals.map((s) => (
          <div
            key={s.mint}
            style={{
              borderRadius: 16,
              padding: "18px 20px",
              background: colors.panelSoft,
              border: `1px solid ${s.wasPreviouslyPushedAsBuy ? colors.coral : colors.line}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <Link href={`/tokens/${s.mint}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 16, fontWeight: 500 }}>{s.symbol}</div>
                  {s.wasPreviouslyPushedAsBuy && (
                    <div
                      style={{
                        fontSize: 10,
                        padding: "3px 9px",
                        borderRadius: 999,
                        background: "rgba(255,122,107,0.15)",
                        color: colors.coral,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Previously flagged as a buy
                    </div>
                  )}
                </div>
                <div style={{ fontFamily: mono, fontSize: 11, color: colors.textFaint, marginTop: 3 }}>
                  {truncateAddress(s.mint)}
                </div>
              </Link>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 500, color: colors.coral }}>
                  {s.exitConvictionScore}
                </div>
                <StatLabel
                  compact
                  tooltipAlign="right"
                  tooltip="0-100 score blending how good/proven the selling wallets are with how many of them independently agree, adjusted down the longer ago the most recent confirming sell was. Same math as buy-side Conviction, applied to sells."
                >
                  EXIT CONVICTION
                </StatLabel>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginTop: 14 }}>
              <div>
                <div style={{ fontFamily: mono, fontSize: 14.5 }}>{s.sellerCount} wallets</div>
                <StatLabel compact tooltip="How many separately tracked wallets sold this token in the window — not the same wallet selling multiple times.">
                  INDEPENDENT SELLERS
                </StatLabel>
              </div>
              <div>
                <div style={{ fontFamily: mono, fontSize: 14.5 }}>{formatUsd(s.totalSellUsd)}</div>
                <StatLabel compact tooltip="Total dollar amount these confirming wallets sold, combined. Only what our tracked wallets did — not the token's total trading volume from everyone.">
                  TRACKED SELL VOLUME
                </StatLabel>
              </div>
              <div>
                <div style={{ fontFamily: mono, fontSize: 14.5 }}>{formatRelativeTime(s.firstSellAt)}</div>
                <StatLabel compact tooltip="When the first of the confirming wallets sold this token, within the current 48-hour lookback window.">
                  FIRST SELL IN WINDOW
                </StatLabel>
              </div>
              <div>
                <div style={{ fontFamily: mono, fontSize: 14.5, color: colors.coral }}>
                  {formatRelativeTime(s.lastSellAt)}
                </div>
                <StatLabel compact tooltip="When the most recent confirming wallet sold. More recent = the exit signal is still 'hot'; conviction decays the further back this gets.">
                  LAST CONFIRMING SELL
                </StatLabel>
              </div>
              <div>
                <div style={{ fontFamily: mono, fontSize: 14.5 }}>{s.priceUsd !== null ? formatUsd(s.priceUsd) : "—"}</div>
                <StatLabel compact tooltip="Current price from DexScreener.">
                  PRICE
                </StatLabel>
              </div>
              <div>
                <div style={{ fontFamily: mono, fontSize: 14.5 }}>
                  {s.liquidityUsd !== null ? formatUsd(s.liquidityUsd) : "—"}
                </div>
                <StatLabel compact tooltip="How much money is available in the token's trading pool right now.">
                  LIQUIDITY
                </StatLabel>
              </div>
            </div>

            <div style={{ marginTop: 14, borderTop: `1px solid ${colors.line}`, paddingTop: 10 }}>
              {s.sellers.slice(0, 4).map((w) => (
                <Link
                  key={w.address}
                  href={`/wallets/${w.address}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "5px 0",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <ScorePill score={w.score} tooltip="This wallet's Smart Score (0-100) — how trustworthy its trading looks, re-checked periodically." />
                    <span style={{ fontSize: 12 }}>{w.label ?? truncateAddress(w.address)}</span>
                    <PnlText value={w.pnl30d} size={10.5} tooltip="This wallet's own realized profit/loss over the last 30 days." />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span style={{ fontFamily: mono, fontSize: 11.5, color: colors.textFaint, whiteSpace: "nowrap" }}>
                      {formatUsd(w.amountUsd)}
                    </span>
                    <ChevronRight size={12} color={colors.textFaint} />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
