import { PageShell } from "@/components/PageShell";
import { NavBar } from "@/components/NavBar";
import { InfoTooltip } from "@/components/InfoTooltip";
import { SectionHeader } from "@/components/SectionHeader";
import { StatLabel } from "@/components/StatLabel";
import { colors, mono } from "@/components/theme";
import { getPerformanceSummary } from "@/lib/performance";
import type { CheckpointKey, CheckpointStats } from "@/lib/performance";
import {
  getWalletPerformanceSummary,
  SOURCE_LABELS,
  type WalletCheckpointKey,
  type WalletCheckpointStats,
} from "@/lib/wallet-performance";
import { truncateAddress, formatRelativeTime, displaySymbol } from "@/lib/format";

export const dynamic = "force-dynamic";

const CHECKPOINT_LABELS: Record<CheckpointKey, string> = {
  "1h": "1 HOUR",
  "6h": "6 HOURS",
  "24h": "24 HOURS",
  "48h": "48 HOURS",
};
const CHECKPOINT_KEYS: CheckpointKey[] = ["1h", "6h", "24h", "48h"];

function changeColor(value: number | null): string {
  if (value === null) return colors.textFaint;
  return value >= 0 ? colors.mint : colors.coral;
}

function formatChange(value: number | null): string {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value}%`;
}

function CheckpointCard({ label, stats }: { label: string; stats: CheckpointStats }) {
  return (
    <div style={{ padding: 14, borderRadius: 12, background: colors.panelSoft, border: `1px solid ${colors.line}` }}>
      <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 500, color: changeColor(stats.avgChangePercent) }}>
        {formatChange(stats.avgChangePercent)}
      </div>
      <StatLabel tooltip={`Average net performance of all pushed signals at ${label.toLowerCase()}, measured from a simulated entry ~90s after push (not the exact push-instant price) and net of 1.5% slippage per side plus gas costs — what a live trade following the signal would actually have netted, not just the raw token price move.`}>
        AVG CHANGE · {label}
      </StatLabel>
      <div style={{ fontSize: 11, color: colors.textDim, marginTop: 8, whiteSpace: "nowrap" }}>
        {stats.sampleSize === 0
          ? "No data yet"
          : (
            <>
              {stats.winRatePercent}% positive · n={stats.sampleSize}
              <InfoTooltip text="% positive = the share of tracked signals whose net-of-cost performance was still positive at this checkpoint. n = how many signals have reached this checkpoint so far." />
            </>
          )}
      </div>
      {stats.stillLiquidPercent !== null && (
        <div
          style={{
            fontSize: 11,
            marginTop: 3,
            color: stats.stillLiquidPercent < 100 ? colors.coral : colors.textDim,
            whiteSpace: "nowrap",
          }}
        >
          {stats.stillLiquidPercent}% still tradeable
          <InfoTooltip text="Share of these tokens whose liquidity was still above the tradeable floor at this checkpoint. Below 100% means some of the price 'gains' shown above may not have actually been possible to sell into." />
        </div>
      )}
    </div>
  );
}

const WALLET_CHECKPOINT_LABELS: Record<WalletCheckpointKey, string> = {
  "7d": "7 DAYS",
  "14d": "14 DAYS",
  "30d": "30 DAYS",
};
const WALLET_CHECKPOINT_KEYS: WalletCheckpointKey[] = ["7d", "14d", "30d"];

function scoreChangeColor(value: number | null): string {
  if (value === null) return colors.textFaint;
  return value >= 0 ? colors.mint : colors.coral;
}

function formatScoreChange(value: number | null): string {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value}`;
}

function WalletCheckpointCard({ label, stats }: { label: string; stats: WalletCheckpointStats }) {
  return (
    <div style={{ padding: 14, borderRadius: 12, background: colors.panelSoft, border: `1px solid ${colors.line}` }}>
      <div
        style={{
          fontFamily: mono,
          fontSize: 22,
          fontWeight: 500,
          color: stats.survivalRatePercent === null ? colors.textFaint : stats.survivalRatePercent >= 70 ? colors.mint : colors.coral,
        }}
      >
        {stats.survivalRatePercent === null ? "—" : `${stats.survivalRatePercent}%`}
      </div>
      <StatLabel tooltip={`Of wallets discovered at least ${label.toLowerCase()} ago, the % still actively tracked today — the rest got removed automatically (went inactive, or a re-check found they no longer met the quality bar).`}>
        STILL TRACKED · {label}
      </StatLabel>
      <div style={{ fontSize: 11, color: colors.textDim, marginTop: 8, whiteSpace: "nowrap" }}>
        {stats.sampleSize === 0 ? (
          "No data yet"
        ) : (
          <>
            avg score{" "}
            <span style={{ color: scoreChangeColor(stats.avgScoreChange), fontFamily: mono }}>
              {formatScoreChange(stats.avgScoreChange)}
            </span>{" "}
            · n={stats.sampleSize}
            <InfoTooltip text="Average change in Smart Score from discovery to this checkpoint, across ALL wallets that reached it (including ones later removed) — not just the survivors, so this can't be flattered by ignoring failures." />
          </>
        )}
      </div>
    </div>
  );
}

export default async function PerformancePage() {
  const { summary, recent } = await getPerformanceSummary(30);
  const { summary: walletSummary, recent: recentWallets } = await getWalletPerformanceSummary(20);

  return (
    <PageShell>
      <NavBar active="Performance" />
      <div style={{ margin: "24px 0 4px" }}>
        <div style={{ fontSize: 21, fontWeight: 500, letterSpacing: "-0.3px" }}>Signal Performance</div>
        <div style={{ fontSize: 12.5, color: colors.textFaint, marginTop: 4 }}>
          How tokens actually moved after we pushed a signal for them — measured from a simulated entry ~90s later
          and net of 1.5% slippage per side plus gas costs, not just the raw price move or the conviction score we
          assigned it.
        </div>
      </div>

      {summary.totalTracked === 0 ? (
        <div style={{ fontSize: 12.5, color: colors.textFaint, padding: "24px 4px" }}>
          No pushed signals tracked yet — this fills in as the Telegram bot pushes new signals and their prices are
          checked over the following 48h.
        </div>
      ) : (
        <>
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
            {CHECKPOINT_KEYS.map((key) => (
              <CheckpointCard key={key} label={CHECKPOINT_LABELS[key]} stats={summary.overall[key]} />
            ))}
          </div>

          <SectionHeader
            style={{ marginTop: 28, marginBottom: 12 }}
            tooltip="The same net-of-cost average-change numbers, split by how confident the signal was when pushed. The whole point of this table: checking whether 'very strong' conviction actually performed better than 'moderate' — not just assuming it."
          >
            BY CONVICTION
          </SectionHeader>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", fontSize: 10.5, color: colors.textFaint, fontWeight: 500, padding: "0 10px 8px 4px" }}>
                    CONVICTION
                  </th>
                  {CHECKPOINT_KEYS.map((key) => (
                    <th
                      key={key}
                      style={{ textAlign: "right", fontSize: 10.5, color: colors.textFaint, fontWeight: 500, padding: "0 10px 8px" }}
                    >
                      {CHECKPOINT_LABELS[key]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.byConvictionBucket.map((bucket) => (
                  <tr key={bucket.label} style={{ borderTop: `1px solid ${colors.line}` }}>
                    <td style={{ fontSize: 12.5, padding: "10px 10px 10px 4px" }}>{bucket.label}</td>
                    {CHECKPOINT_KEYS.map((key) => {
                      const stats = bucket.checkpoints[key];
                      return (
                        <td
                          key={key}
                          style={{
                            textAlign: "right",
                            fontFamily: mono,
                            fontSize: 12.5,
                            padding: "10px",
                            color: changeColor(stats.avgChangePercent),
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatChange(stats.avgChangePercent)}
                          {stats.sampleSize > 0 && (
                            <span style={{ color: colors.textFaint, fontSize: 10.5 }}> (n={stats.sampleSize})</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <SectionHeader
            style={{ marginTop: 28, marginBottom: 12 }}
            tooltip="Every individual signal we've pushed to Telegram, with its net-of-cost performance at each checkpoint since (entry ~90s after push, minus slippage and gas). A ⚠ next to a number means liquidity had already dropped too low by then for that change to be realistically tradeable."
          >
            RECENT PUSHES
          </SectionHeader>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", fontSize: 10.5, color: colors.textFaint, fontWeight: 500, padding: "0 10px 8px 4px" }}>
                    TOKEN
                  </th>
                  <th style={{ textAlign: "right", fontSize: 10.5, color: colors.textFaint, fontWeight: 500, padding: "0 10px 8px" }}>
                    CONVICTION
                  </th>
                  <th style={{ textAlign: "right", fontSize: 10.5, color: colors.textFaint, fontWeight: 500, padding: "0 10px 8px" }}>
                    PUSHED
                  </th>
                  {CHECKPOINT_KEYS.map((key) => (
                    <th
                      key={key}
                      style={{ textAlign: "right", fontSize: 10.5, color: colors.textFaint, fontWeight: 500, padding: "0 10px 8px" }}
                    >
                      {CHECKPOINT_LABELS[key]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={`${r.mint}-${r.pushedAt.toISOString()}`} style={{ borderTop: `1px solid ${colors.line}` }}>
                    <td style={{ fontSize: 12.5, padding: "10px 10px 10px 4px" }}>
                      {displaySymbol(r.symbol, r.mint)}
                      <div style={{ fontFamily: mono, fontSize: 10, color: colors.textFaint }}>{truncateAddress(r.mint)}</div>
                    </td>
                    <td style={{ textAlign: "right", fontFamily: mono, fontSize: 12.5, padding: "10px" }}>
                      {r.convictionScore}
                    </td>
                    <td style={{ textAlign: "right", fontSize: 11, color: colors.textFaint, padding: "10px" }}>
                      {formatRelativeTime(r.pushedAt)}
                    </td>
                    {CHECKPOINT_KEYS.map((key) => (
                      <td
                        key={key}
                        style={{
                          textAlign: "right",
                          fontFamily: mono,
                          fontSize: 12.5,
                          padding: "10px",
                          color: changeColor(r.changePercent[key] ?? null),
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatChange(r.changePercent[key] ?? null)}
                        {r.wentIlliquid[key] && (
                          <span style={{ marginLeft: 1, color: colors.coral, display: "inline-flex", alignItems: "center" }}>
                            ⚠
                            <InfoTooltip text="Liquidity had dropped below the tradeable floor by this checkpoint — this change may not have been realizable." align="right" />
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ margin: "44px 0 4px" }}>
        <div style={{ fontSize: 21, fontWeight: 500, letterSpacing: "-0.3px" }}>Wallet Discovery Quality</div>
        <div style={{ fontSize: 12.5, color: colors.textFaint, marginTop: 4 }}>
          Whether wallets we discover actually stay good — tracked from the moment each one is first added, not just
          reacted to afterward.
        </div>
      </div>

      {walletSummary.totalTracked === 0 ? (
        <div style={{ fontSize: 12.5, color: colors.textFaint, padding: "24px 4px" }}>
          No newly discovered wallets tracked yet — this fills in as new wallets are discovered and checked again
          over the following 30 days.
        </div>
      ) : (
        <>
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
            {WALLET_CHECKPOINT_KEYS.map((key) => (
              <WalletCheckpointCard key={key} label={WALLET_CHECKPOINT_LABELS[key]} stats={walletSummary.overall[key]} />
            ))}
          </div>

          <SectionHeader
            style={{ marginTop: 28, marginBottom: 12 }}
            tooltip="Same still-tracked/score-change numbers, split by which discovery channel first surfaced the wallet — shows which sources tend to produce more durable 'smart money', not just a one-time lucky score."
          >
            BY DISCOVERY SOURCE
          </SectionHeader>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", fontSize: 10.5, color: colors.textFaint, fontWeight: 500, padding: "0 10px 8px 4px" }}>
                    SOURCE
                  </th>
                  {WALLET_CHECKPOINT_KEYS.map((key) => (
                    <th
                      key={key}
                      style={{ textAlign: "right", fontSize: 10.5, color: colors.textFaint, fontWeight: 500, padding: "0 10px 8px" }}
                    >
                      {WALLET_CHECKPOINT_LABELS[key]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {walletSummary.bySource.map((bucket) => (
                  <tr key={bucket.source} style={{ borderTop: `1px solid ${colors.line}` }}>
                    <td style={{ fontSize: 12.5, padding: "10px 10px 10px 4px", whiteSpace: "nowrap" }}>
                      {SOURCE_LABELS[bucket.source] ?? bucket.source}
                    </td>
                    {WALLET_CHECKPOINT_KEYS.map((key) => {
                      const stats = bucket.checkpoints[key];
                      return (
                        <td
                          key={key}
                          style={{
                            textAlign: "right",
                            fontFamily: mono,
                            fontSize: 12.5,
                            padding: "10px",
                            color: stats.survivalRatePercent === null ? colors.textFaint : stats.survivalRatePercent >= 70 ? colors.mint : colors.coral,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {stats.survivalRatePercent === null ? "—" : `${stats.survivalRatePercent}%`}
                          {stats.sampleSize > 0 && (
                            <span style={{ color: colors.textFaint, fontSize: 10.5 }}> (n={stats.sampleSize})</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <SectionHeader
            style={{ marginTop: 28, marginBottom: 12 }}
            tooltip="Every wallet the moment it was first discovered, with its starting Smart Score vs. the most recent checkpoint reading available. 'pending' means it hasn't reached its first 7-day checkpoint yet."
          >
            RECENT DISCOVERIES
          </SectionHeader>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", fontSize: 10.5, color: colors.textFaint, fontWeight: 500, padding: "0 10px 8px 4px" }}>
                    WALLET
                  </th>
                  <th style={{ textAlign: "left", fontSize: 10.5, color: colors.textFaint, fontWeight: 500, padding: "0 10px 8px" }}>
                    SOURCE
                  </th>
                  <th style={{ textAlign: "right", fontSize: 10.5, color: colors.textFaint, fontWeight: 500, padding: "0 10px 8px" }}>
                    DISCOVERED
                  </th>
                  <th style={{ textAlign: "right", fontSize: 10.5, color: colors.textFaint, fontWeight: 500, padding: "0 10px 8px" }}>
                    INITIAL SCORE
                  </th>
                  <th style={{ textAlign: "right", fontSize: 10.5, color: colors.textFaint, fontWeight: 500, padding: "0 10px 8px" }}>
                    LATEST
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentWallets.map((w) => (
                  <tr key={`${w.address}-${w.discoveredAt.toISOString()}`} style={{ borderTop: `1px solid ${colors.line}` }}>
                    <td style={{ fontFamily: mono, fontSize: 11.5, padding: "10px 10px 10px 4px" }}>
                      {truncateAddress(w.address)}
                    </td>
                    <td style={{ fontSize: 11.5, color: colors.textFaint, padding: "10px", whiteSpace: "nowrap" }}>
                      {SOURCE_LABELS[w.source] ?? w.source}
                    </td>
                    <td style={{ textAlign: "right", fontSize: 11, color: colors.textFaint, padding: "10px" }}>
                      {formatRelativeTime(w.discoveredAt)}
                    </td>
                    <td style={{ textAlign: "right", fontFamily: mono, fontSize: 12.5, padding: "10px" }}>
                      {w.initialScore}
                    </td>
                    <td style={{ textAlign: "right", fontFamily: mono, fontSize: 12.5, padding: "10px", whiteSpace: "nowrap" }}>
                      {w.latestScore === null ? (
                        <span style={{ color: colors.textFaint }}>pending</span>
                      ) : (
                        <>
                          {w.latestScore}{" "}
                          <span style={{ fontSize: 10, color: w.latestStillWatched ? colors.mint : colors.coral }}>
                            {w.latestStillWatched ? "tracked" : "removed"}
                          </span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </PageShell>
  );
}
