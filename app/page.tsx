import { PageShell } from "@/components/PageShell";
import { NavBar } from "@/components/NavBar";
import { Hero } from "@/components/Hero";
import { WalletList } from "@/components/WalletList";
import { TokenFlows } from "@/components/TokenFlows";
import { SignalsPreview } from "@/components/SignalsPreview";
import { LiveAlerts } from "@/components/LiveAlerts";
import { SignalPerformanceSnapshot } from "@/components/SignalPerformanceSnapshot";
import { getTopWallets, getLiveAlerts, getTokenFlows, getDashboardKpis } from "@/lib/dashboard-data";
import { getCachedConvergenceSignals } from "@/lib/signals";
import { getRecentPerformanceSnapshot } from "@/lib/performance";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [wallets, alerts, flows, kpis, signals, performanceSnapshot] = await Promise.all([
    getTopWallets(),
    getLiveAlerts(),
    getTokenFlows(),
    getDashboardKpis(),
    getCachedConvergenceSignals(3),
    getRecentPerformanceSnapshot(),
  ]);

  return (
    <PageShell>
      <NavBar active="Overview" />
      <Hero kpis={kpis} topWallet={wallets[0]} />
      <SignalPerformanceSnapshot snapshot={performanceSnapshot} />

      <div className="ttw4-main">
        <div>
          <SignalsPreview signals={signals} />
          <WalletList wallets={wallets} />
          <TokenFlows flows={flows} />
        </div>
        <LiveAlerts alerts={alerts} />
      </div>
    </PageShell>
  );
}
