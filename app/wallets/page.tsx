import { PageShell } from "@/components/PageShell";
import { NavBar } from "@/components/NavBar";
import { WalletList } from "@/components/WalletList";
import { colors } from "@/components/theme";
import { getTopWallets } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function WalletsPage() {
  const wallets = await getTopWallets(200);

  return (
    <PageShell>
      <NavBar active="Wallets" />
      <div style={{ margin: "24px 0 16px" }}>
        <div style={{ fontSize: 21, fontWeight: 500, letterSpacing: "-0.3px" }}>All Tracked Wallets</div>
        <div style={{ fontSize: 12.5, color: colors.textFaint, marginTop: 4 }}>{wallets.length} wallets, sorted by smart score</div>
      </div>
      <WalletList wallets={wallets} />
    </PageShell>
  );
}
