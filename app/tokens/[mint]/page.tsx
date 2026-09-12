import Link from "next/link";
import { ArrowLeft, ExternalLink, ArrowUpRight, ArrowDownRight, ChevronRight } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { NavBar } from "@/components/NavBar";
import { SectionHeader } from "@/components/SectionHeader";
import { StatLabel } from "@/components/StatLabel";
import { colors, mono } from "@/components/theme";
import { PriceChart } from "@/components/PriceChart";
import { getTokenDetail } from "@/lib/dashboard-data";
import { formatUsd, truncateAddress, formatRelativeTime } from "@/lib/format";
import { MIN_SIGNAL_LIQUIDITY_USD } from "@/lib/signals";

export const dynamic = "force-dynamic";

export default async function TokenDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ mint: string }>;
  searchParams: Promise<{ wallet?: string }>;
}) {
  const { mint } = await params;
  const { wallet: focusWalletAddress } = await searchParams;
  const token = await getTokenDetail(mint, focusWalletAddress);

  if (!token) {
    return (
      <PageShell>
        <NavBar />
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <Link href="/" style={{ color: colors.textDim, fontSize: 13, textDecoration: "none" }}>
            ← Back to dashboard
          </Link>
          <div style={{ marginTop: 40, fontSize: 15, color: colors.textFaint }}>
            Token <span style={{ fontFamily: mono }}>{truncateAddress(mint)}</span> is not being tracked.
          </div>
        </div>
      </PageShell>
    );
  }

  const netFlow = token.totalBuyUsd - token.totalSellUsd;
  const netPositive = netFlow >= 0;

  return (
    <PageShell>
      <NavBar />
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ padding: "24px 0 16px" }}>
          {token.focusWallet ? (
            <Link
              href={`/wallets/${token.focusWallet.address}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: colors.textDim,
                fontSize: 13,
                textDecoration: "none",
              }}
            >
              <ArrowLeft size={14} /> Back to wallet
            </Link>
          ) : (
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
          )}
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
              <div style={{ fontSize: 20, fontWeight: 500 }}>{token.symbol}</div>
              <div style={{ fontFamily: mono, fontSize: 12.5, color: colors.textFaint, marginTop: 4 }}>
                {token.mint}
              </div>
              {token.name && <div style={{ fontSize: 12.5, color: colors.textDim, marginTop: 4 }}>{token.name}</div>}
              {token.liquidityUsd !== null && token.liquidityUsd < MIN_SIGNAL_LIQUIDITY_USD && (
                <div
                  style={{
                    marginTop: 8,
                    display: "inline-block",
                    fontSize: 11,
                    padding: "3px 9px",
                    borderRadius: 999,
                    background: "rgba(255,122,107,0.1)",
                    color: colors.coral,
                  }}
                >
                  Low liquidity — may not be possible to exit a real position without heavy slippage
                </div>
              )}
            </div>
            <a
              href={`https://solscan.io/token/${token.mint}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: colors.cyan, textDecoration: "none" }}
            >
              Solscan <ExternalLink size={12} />
            </a>
          </div>

          <div style={{ display: "flex", marginTop: 24, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 0", minWidth: 120, padding: "0 20px 0 0" }}>
              <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 500 }}>
                {token.priceUsd !== null ? formatUsd(token.priceUsd) : "—"}
              </div>
              <StatLabel tooltip="Current price from DexScreener, picking whichever trading pool has the most liquidity if the token trades on more than one.">
                PRICE
              </StatLabel>
            </div>
            <div style={{ flex: "1 1 0", minWidth: 120, padding: "0 20px", borderLeft: `1px solid ${colors.lineStrong}` }}>
              <div
                style={{
                  fontFamily: mono,
                  fontSize: 18,
                  fontWeight: 500,
                  color:
                    token.liquidityUsd !== null && token.liquidityUsd < MIN_SIGNAL_LIQUIDITY_USD
                      ? colors.coral
                      : colors.text,
                }}
              >
                {token.liquidityUsd !== null ? formatUsd(token.liquidityUsd) : "—"}
              </div>
              <StatLabel tooltip="How much money is available in this token's trading pool right now — the more there is, the easier it is to buy or sell a real position without moving the price much. Below $50,000 is flagged as too thin to reliably exit.">
                LIQUIDITY
              </StatLabel>
            </div>
            <div style={{ flex: "1 1 0", minWidth: 120, padding: "0 20px", borderLeft: `1px solid ${colors.lineStrong}` }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontFamily: mono,
                  fontSize: 18,
                  fontWeight: 500,
                  color: netPositive ? colors.mint : colors.coral,
                }}
              >
                {netPositive ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                {formatUsd(Math.abs(netFlow))}
              </div>
              <StatLabel tooltip="Total tracked BUYs minus total tracked SELLs for this token, across all our watched wallets combined. Positive = tracked wallets have net accumulated; negative = they've net sold.">
                NET FLOW (TRACKED)
              </StatLabel>
            </div>
            <div style={{ flex: "1 1 0", minWidth: 120, padding: "0 0 0 20px", borderLeft: `1px solid ${colors.lineStrong}` }}>
              <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 500 }}>{token.walletCount}</div>
              <StatLabel tooltip="How many of our tracked wallets have bought or sold this token at all, ever (not just recently).">
                ACTIVE SMART WALLETS
              </StatLabel>
            </div>
          </div>
        </section>

        <section style={{ marginTop: 28 }}>
          <SectionHeader
            style={{ marginBottom: 12 }}
            tooltip="Hourly price over the last 7 days. Historical price data comes from GeckoTerminal and can occasionally be temporarily unavailable for very new or illiquid tokens."
            suffix={
              token.focusWallet && (
                <span style={{ color: colors.textFaint, letterSpacing: "normal", fontSize: 11 }}>
                  {" "}
                  · Markers = trades by {token.focusWallet.label ?? truncateAddress(token.focusWallet.address)}
                </span>
              )
            }
          >
            PRICE HISTORY (7D)
          </SectionHeader>
          <div style={{ padding: 14, borderRadius: 12, background: colors.panelSoft, border: `1px solid ${colors.line}` }}>
            <PriceChart points={token.priceHistory} markers={token.focusWallet?.trades} />
          </div>
        </section>

        <section style={{ marginTop: 28 }}>
          <SectionHeader
            style={{ marginBottom: 12 }}
            tooltip="Every tracked wallet that's bought or sold this token, with their combined buy/sell totals — sorted by whoever has traded the most of it."
          >
            ACTIVE SMART WALLETS
          </SectionHeader>
          {token.wallets.length === 0 && (
            <div style={{ fontSize: 12.5, color: colors.textFaint, padding: "12px 4px" }}>
              No tracked wallets have activity in this token.
            </div>
          )}
          {token.wallets.map((w) => (
            <Link
              key={w.address}
              href={`/wallets/${w.address}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 4px",
                borderBottom: `1px solid ${colors.line}`,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{w.label ?? truncateAddress(w.address)}</div>
                <div style={{ fontFamily: mono, fontSize: 11, color: colors.textFaint }}>{truncateAddress(w.address)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: mono, fontSize: 12.5, color: colors.text }}>
                    Buy {formatUsd(w.buyUsd)} · Sell {formatUsd(w.sellUsd)}
                  </div>
                  <div style={{ fontSize: 11, color: colors.textFaint, marginTop: 2 }}>
                    {formatRelativeTime(w.lastActivityAt)}
                  </div>
                </div>
                <ChevronRight size={14} color={colors.textFaint} />
              </div>
            </Link>
          ))}
        </section>
      </div>
    </PageShell>
  );
}
