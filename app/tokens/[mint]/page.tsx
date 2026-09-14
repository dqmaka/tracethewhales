import Link from "next/link";
import { ArrowLeft, ExternalLink, ArrowUpRight, ArrowDownRight, ChevronRight } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { NavBar } from "@/components/NavBar";
import { SectionHeader } from "@/components/SectionHeader";
import { StatLabel } from "@/components/StatLabel";
import { colors, mono } from "@/components/theme";
import { PriceChart } from "@/components/PriceChart";
import { InfoTooltip } from "@/components/InfoTooltip";
import { CopyButton } from "@/components/CopyButton";
import { WalletIdenticon } from "@/components/WalletIdenticon";
import { getTokenDetail } from "@/lib/dashboard-data";
import { formatUsd, truncateAddress, formatRelativeTime, displaySymbol } from "@/lib/format";
import { MIN_SIGNAL_LIQUIDITY_USD } from "@/lib/signals";

export const dynamic = "force-dynamic";

/**
 * Renounced (authority == null) is reassurance, not just the absence of a
 * warning — shown either way (unlike the signals pipeline's riskFlags,
 * which only ever list active concerns) so silence on this page can't be
 * misread as "unchecked" rather than "verified safe". Omitted entirely only
 * when the on-chain lookup itself failed (active === null).
 */
function AuthorityBadge({ label, active, tooltip }: { label: string; active: boolean; tooltip: string }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        padding: "3px 9px",
        borderRadius: 999,
        background: active ? "rgba(255,122,107,0.1)" : "rgba(53,245,160,0.1)",
        color: active ? colors.coral : colors.mint,
      }}
    >
      {label}: {active ? "Active" : "Renounced"}
      <InfoTooltip text={tooltip} />
    </div>
  );
}

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
              <div style={{ fontSize: 20, fontWeight: 500 }}>{displaySymbol(token.symbol, token.mint)}</div>
              <div style={{ fontFamily: mono, fontSize: 12.5, color: colors.textFaint, marginTop: 4, display: "flex", alignItems: "center" }}>
                {token.mint}
                <CopyButton value={token.mint} />
              </div>
              {token.name && <div style={{ fontSize: 12.5, color: colors.textDim, marginTop: 4 }}>{token.name}</div>}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {token.liquidityUsd !== null && token.liquidityUsd < MIN_SIGNAL_LIQUIDITY_USD && (
                  <div
                    style={{
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
                {token.mintAuthorityActive !== null && (
                  <AuthorityBadge
                    label="Mint authority"
                    active={token.mintAuthorityActive}
                    tooltip="Whether the token deployer can still mint new supply at will. An active mint authority means the total supply isn't fixed — it could be inflated at any time, diluting every holder. Renounced (revoked, permanently) is the safer state."
                  />
                )}
                {token.freezeAuthorityActive !== null && (
                  <AuthorityBadge
                    label="Freeze authority"
                    active={token.freezeAuthorityActive}
                    tooltip="Whether the token deployer can still freeze any holder's tokens, blocking them from selling. An active freeze authority is a classic rug vector — Renounced (revoked, permanently) means no one can lock your funds this way."
                  />
                )}
              </div>
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
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <WalletIdenticon address={w.address} size={22} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{w.label ?? truncateAddress(w.address)}</div>
                  <div style={{ fontFamily: mono, fontSize: 11, color: colors.textFaint }}>{truncateAddress(w.address)}</div>
                </div>
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
