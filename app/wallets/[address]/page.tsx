import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { NavBar } from "@/components/NavBar";
import { SectionHeader } from "@/components/SectionHeader";
import { StatLabel } from "@/components/StatLabel";
import { PnlText } from "@/components/PnlText";
import { colors, mono } from "@/components/theme";
import { getWalletDetail } from "@/lib/dashboard-data";
import { formatUsd, truncateAddress, formatRelativeTime, displaySymbol } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function WalletDetailPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const wallet = await getWalletDetail(address);

  if (!wallet) {
    return (
      <PageShell>
        <NavBar active="Wallets" />
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <Link href="/" style={{ color: colors.textDim, fontSize: 13, textDecoration: "none" }}>
            ← Back to dashboard
          </Link>
          <div style={{ marginTop: 40, fontSize: 15, color: colors.textFaint }}>
            Wallet <span style={{ fontFamily: mono }}>{truncateAddress(address)}</span> is not being tracked.
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <NavBar active="Wallets" />
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ padding: "24px 0 16px" }}>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: colors.textDim,
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            <ArrowLeft size={14} /> Back to dashboard
          </Link>
        </div>

        <section
          style={{
            borderRadius: 20,
            padding: "24px 26px",
            background: colors.panelSoft,
            border: `1px solid ${colors.line}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 500 }}>{wallet.label ?? truncateAddress(wallet.address)}</div>
              <div style={{ fontFamily: mono, fontSize: 12.5, color: colors.textFaint, marginTop: 4 }}>
                {wallet.address}
              </div>
              {wallet.tag && (
                <div
                  style={{
                    marginTop: 8,
                    display: "inline-block",
                    fontSize: 11,
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.06)",
                    color: colors.textDim,
                  }}
                >
                  {wallet.tag}
                </div>
              )}
            </div>
            <a
              href={`https://solscan.io/account/${wallet.address}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: colors.cyan, textDecoration: "none" }}
            >
              Solscan <ExternalLink size={12} />
            </a>
          </div>

          <div style={{ display: "flex", marginTop: 24, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 0", minWidth: 120, padding: "0 20px 0 0" }}>
              <div
                style={{
                  fontFamily: mono,
                  fontSize: 28,
                  fontWeight: 500,
                  color: wallet.score >= 85 ? colors.mint : colors.cyan,
                }}
              >
                {wallet.score}
              </div>
              <StatLabel tooltip="0-100 rating of how trustworthy this wallet's trading looks — behavioral quality (activity, consistency, follow-through, diversity) blended with real profit history. Automated bot patterns pull this down. Periodically re-checked against current behavior, not fixed forever.">
                SMART SCORE
              </StatLabel>
            </div>
            <div style={{ flex: "1 1 0", minWidth: 120, padding: "0 20px", borderLeft: `1px solid ${colors.lineStrong}` }}>
              <PnlText value={wallet.pnl30d} size={22} showArrow />
              <StatLabel tooltip="This wallet's own realized profit/loss over the last 30 days — not a prediction of what copying its trades today would earn.">
                PNL 30D
              </StatLabel>
            </div>
            <div style={{ flex: "1 1 0", minWidth: 120, padding: "0 20px", borderLeft: `1px solid ${colors.lineStrong}` }}>
              <div style={{ fontFamily: mono, fontSize: 15, color: colors.text }}>
                {wallet.firstSeenAt.toLocaleDateString("en-US")}
              </div>
              <StatLabel tooltip="The date we first started tracking this wallet — either when it was automatically discovered, or manually added.">
                FIRST SEEN
              </StatLabel>
            </div>
            <div style={{ flex: "1 1 0", minWidth: 120, padding: "0 0 0 20px", borderLeft: `1px solid ${colors.lineStrong}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: wallet.isWatched ? colors.mint : colors.textFaint,
                    boxShadow: wallet.isWatched ? `0 0 8px ${colors.mint}` : "none",
                  }}
                />
                {wallet.isWatched ? "Live tracking active" : "Not actively tracked"}
              </div>
              <StatLabel
                tooltip="Whether this wallet currently counts toward Trade Signals and Alerts. Wallets get automatically removed if they stop trading for 14+ days, or if a periodic re-check finds they no longer meet the quality bar."
                tooltipAlign="right"
              >
                STATUS
              </StatLabel>
            </div>
          </div>
        </section>

        {wallet.liveActivity && (
          <section style={{ marginTop: 28 }}>
            <SectionHeader
              style={{ marginBottom: 12 }}
              tooltip="What actually makes up the Smart Score above, recomputed live from this wallet's recent on-chain trades (not the last-saved database value)."
            >
              SCORE-BREAKDOWN (LIVE)
            </SectionHeader>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14 }}>
              {[
                {
                  label: "Activity",
                  value: wallet.liveActivity.breakdown.activity,
                  info: "How much this wallet has traded recently, weighted so newer trades count more than old ones. Very inactive wallets score low here.",
                },
                {
                  label: "Consistency",
                  value: wallet.liveActivity.breakdown.consistency,
                  info: "How similar this wallet's position sizes are to each other. Less erratic sizing scores higher — though note a bot spamming identical tiny buys also scores high here, which is why bot-detection checks exist separately.",
                },
                {
                  label: "Round-Trip-Rate",
                  value: wallet.liveActivity.breakdown.roundTripRate,
                  info: "Share of tokens this wallet bought that it also later sold — a proxy for actually realizing gains, not just holding paper positions forever.",
                },
                {
                  label: "Diversity",
                  value: wallet.liveActivity.breakdown.diversity,
                  info: "How many different tokens this wallet has traded. Trading only one or two tokens ever scores lower than a wallet with a broad track record.",
                },
                {
                  label: "Profit",
                  value: wallet.liveActivity.breakdown.profit,
                  info: "Net realized result (sells minus buys) on tokens this wallet has both bought and sold — centered at 50 (break-even). Positions it's still holding aren't counted here, since there's no realized gain or loss to judge yet.",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{ padding: 14, borderRadius: 12, background: colors.panelSoft, border: `1px solid ${colors.line}` }}
                >
                  <div style={{ fontFamily: mono, fontSize: 18, color: colors.text }}>{item.value.toFixed(1)}</div>
                  <StatLabel tooltip={item.info}>
                    {item.label}
                  </StatLabel>
                  <div
                    style={{
                      height: 4,
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.08)",
                      marginTop: 8,
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ width: `${Math.min(item.value, 100)}%`, height: "100%", background: colors.cyan }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section style={{ marginTop: 28 }}>
          <SectionHeader
            style={{ marginBottom: 12 }}
            tooltip="Tokens this wallet has both bought AND sold, ranked by realized % profit on that round trip. Tokens it only bought (still holding, no sell yet) aren't included here since there's no closing price to measure against."
          >
            TOP TOKENS BY % PROFIT
          </SectionHeader>
          {wallet.topTokens.length === 0 && (
            <div style={{ fontSize: 12.5, color: colors.textFaint, padding: "12px 4px" }}>
              No closed trades (buy + sell) recorded for this wallet yet.
            </div>
          )}
          {wallet.topTokens.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
              {wallet.topTokens.map((t) => {
                return (
                  <div
                    key={t.mint}
                    style={{
                      padding: 14,
                      borderRadius: 12,
                      background: colors.panelSoft,
                      border: `1px solid ${colors.line}`,
                    }}
                  >
                    <Link
                      href={`/tokens/${t.mint}?wallet=${wallet.address}`}
                      style={{ display: "block", textDecoration: "none", color: "inherit" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{displaySymbol(t.symbol, t.mint)}</span>
                        <PnlText value={t.pnlPercent} size={15} showArrow />
                      </div>
                      <div style={{ fontSize: 10.5, color: colors.textFaint, marginTop: 8 }}>
                        Buy {formatUsd(t.totalBuyUsd)} · Sell {formatUsd(t.totalSellUsd)}
                      </div>
                      {t.hasOpenPosition && (
                        <div
                          style={{
                            marginTop: 8,
                            display: "inline-block",
                            fontSize: 9.5,
                            padding: "2px 7px",
                            borderRadius: 999,
                            background: "rgba(255,255,255,0.06)",
                            color: colors.textDim,
                          }}
                        >
                          Position still open — % reflects the sold portion only
                        </div>
                      )}
                    </Link>
                    <a
                      href={`https://solscan.io/token/${t.mint}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 10,
                        color: colors.cyan,
                        textDecoration: "none",
                        marginTop: 8,
                      }}
                    >
                      Solscan <ExternalLink size={10} />
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section style={{ marginTop: 28 }}>
          <SectionHeader
            style={{ marginBottom: 12 }}
            tooltip="This wallet's actual recent swaps, fetched fresh right now — not from our own database. Shows what it's doing even before/without a webhook event, but only reaches back through its most recent transactions."
          >
            RECENT ON-CHAIN ACTIVITY{wallet.liveActivity ? " (live via Helius)" : ""}
          </SectionHeader>
          {!wallet.liveActivity && (
            <div style={{ fontSize: 12.5, color: colors.textFaint, padding: "12px 4px" }}>
              Live activity could not be loaded right now.
            </div>
          )}
          {wallet.liveActivity && wallet.liveActivity.recent.length === 0 && (
            <div style={{ fontSize: 12.5, color: colors.textFaint, padding: "12px 4px" }}>
              No swap activity in the most recently observed transactions.
            </div>
          )}
          {wallet.liveActivity?.recent.map((tx, i) => {
            const Row = tx.signature ? "a" : "div";
            return (
              <Row
                key={i}
                {...(tx.signature
                  ? {
                      href: `https://solscan.io/tx/${tx.signature}`,
                      target: "_blank",
                      rel: "noopener noreferrer",
                    }
                  : {})}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 4px",
                  borderBottom: `1px solid ${colors.line}`,
                  textDecoration: "none",
                  color: "inherit",
                  cursor: tx.signature ? "pointer" : "default",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 500,
                      padding: "2px 7px",
                      borderRadius: 999,
                      color: tx.type === "BUY" ? colors.mint : colors.coral,
                      background: tx.type === "BUY" ? "rgba(53,245,160,0.1)" : "rgba(255,122,107,0.1)",
                    }}
                  >
                    {tx.type}
                  </span>
                  <span style={{ fontFamily: mono, fontSize: 12.5, color: colors.textFaint }}>
                    {truncateAddress(tx.tokenMint)}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ fontFamily: mono, fontSize: 12.5, color: colors.text }}>{formatUsd(tx.amountUsd)}</span>
                  <span style={{ fontSize: 11, color: colors.textFaint }}>{formatRelativeTime(tx.occurredAt)}</span>
                </div>
              </Row>
            );
          })}
        </section>

        <section style={{ marginTop: 28 }}>
          <SectionHeader
            style={{ marginBottom: 12 }}
            tooltip="Trades we were notified about in real time as they happened, permanently stored in our own records. This is what Trade Signals and Alerts are actually built from — the section above is just a live snapshot for context."
          >
            TRACKED TRANSACTIONS (WEBHOOK)
          </SectionHeader>
          {wallet.trackedTransactions.length === 0 && (
            <div style={{ fontSize: 12.5, color: colors.textFaint, padding: "12px 4px" }}>
              No transactions recorded via the Helius webhook yet.
            </div>
          )}
          {wallet.trackedTransactions.map((tx) => (
            <a
              key={tx.txHash}
              href={`https://solscan.io/tx/${tx.signature}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 4px",
                borderBottom: `1px solid ${colors.line}`,
                textDecoration: "none",
                color: "inherit",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 500,
                    padding: "2px 7px",
                    borderRadius: 999,
                    color: tx.type === "BUY" ? colors.mint : colors.coral,
                    background: tx.type === "BUY" ? "rgba(53,245,160,0.1)" : "rgba(255,122,107,0.1)",
                  }}
                >
                  {tx.type}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 500 }}>{displaySymbol(tx.token, tx.tokenMint)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontFamily: mono, fontSize: 12.5, color: colors.text }}>{formatUsd(tx.amountUsd)}</span>
                <span style={{ fontSize: 11, color: colors.textFaint }}>{formatRelativeTime(tx.occurredAt)}</span>
              </div>
            </a>
          ))}
        </section>
      </div>
    </PageShell>
  );
}
