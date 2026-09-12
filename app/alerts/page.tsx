import { PageShell } from "@/components/PageShell";
import { NavBar } from "@/components/NavBar";
import { LiveAlerts } from "@/components/LiveAlerts";
import { colors } from "@/components/theme";
import { getLiveAlerts } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const alerts = await getLiveAlerts(200);

  return (
    <PageShell>
      <NavBar active="Alerts" />
      <div style={{ margin: "24px 0 16px" }}>
        <div style={{ fontSize: 21, fontWeight: 500, letterSpacing: "-0.3px" }}>Alert History</div>
        <div style={{ fontSize: 12.5, color: colors.textFaint, marginTop: 4 }}>{alerts.length} alerts, newest first</div>
      </div>
      <LiveAlerts alerts={alerts} />
    </PageShell>
  );
}
