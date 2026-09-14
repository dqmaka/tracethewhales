import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { NavBar } from "@/components/NavBar";
import { colors } from "@/components/theme";

export const metadata = { title: "Terms of Service — TraceTheWhales" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.7, color: colors.textDim }}>{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <PageShell>
      <NavBar />
      <div style={{ maxWidth: 720, margin: "0 auto", paddingBottom: 40 }}>
        <div style={{ margin: "24px 0 4px" }}>
          <div style={{ fontSize: 21, fontWeight: 500, letterSpacing: "-0.3px" }}>Terms of Service</div>
          <div style={{ fontSize: 12.5, color: colors.textFaint, marginTop: 4 }}>
            Last updated: September 15, 2026. By using this website or the TraceTheWhales Telegram channel, you agree to these
            terms and to our{" "}
            <Link href="/disclaimer" style={{ color: colors.cyan }}>
              Disclaimer
            </Link>
            , which forms part of them.
          </div>
        </div>

        <Section title="1. Who operates this">
          <p>
            TraceTheWhales is operated by Loris Eliah Hautle, an individual based in Switzerland (&quot;we&quot;,
            &quot;us&quot;, &quot;the operator&quot;). It is not currently operated through a registered company.
            Contact: tracethewhales@gmail.com.
          </p>
        </Section>

        <Section title="2. What the service is">
          <p>
            TraceTheWhales monitors public Solana blockchain activity and publishes automatically-generated
            observations — tracked wallets, token flows, alerts, and &quot;signals&quot; — on this website and via
            a Telegram channel. It is an informational analytics tool, not a trading platform: it never executes
            trades, holds funds, or has custody of anything on your behalf.
          </p>
        </Section>

        <Section title="3. Free of charge, for now">
          <p>
            The service is currently provided free of charge. We may introduce paid tiers, subscriptions, or
            additional features in the future; if we do, separate terms will apply to those specifically and will
            be presented to you before any payment is taken.
          </p>
        </Section>

        <Section title="4. No warranty, no guaranteed availability">
          <p>
            The service is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any
            kind, express or implied — including as to accuracy, reliability, or fitness for a particular purpose.
            We may modify, restrict, suspend, or discontinue the service (in whole or in part), including specific
            wallets, signals, or the Telegram channel itself, at any time and without notice.
          </p>
        </Section>

        <Section title="5. Acceptable use">
          <p>
            You agree not to: (a) use automated means to scrape, overload, or disrupt the website or Telegram
            channel beyond normal personal use; (b) attempt to circumvent any access or rate limits; (c)
            misrepresent content from this service as independently-verified financial advice when redistributing
            it; or (d) use the service for any unlawful purpose.
          </p>
        </Section>

        <Section title="6. Third-party links and data">
          <p>
            The service links to and relies on third-party platforms (e.g. Solscan, Telegram, Helius, Birdeye,
            DexScreener, GeckoTerminal, FOMO). We don&apos;t control, and aren&apos;t responsible for, the content,
            accuracy, or availability of any third-party site or data feed.
          </p>
        </Section>

        <Section title="7. Limitation of liability">
          <p>
            See our{" "}
            <Link href="/disclaimer" style={{ color: colors.cyan }}>
              Disclaimer
            </Link>{" "}
            for the full liability limitation, which applies equally to these terms. In particular, we are not
            liable for any trading or financial losses connected to your use of the service.
          </p>
        </Section>

        <Section title="8. Changes to these terms">
          <p>
            We may update these terms from time to time; the &quot;Last updated&quot; date above will reflect the
            latest version. Continuing to use the service after a change means you accept the updated terms.
          </p>
        </Section>

        <Section title="9. Governing law and jurisdiction">
          <p>
            These terms are governed by the substantive laws of Switzerland, excluding its conflict-of-law rules.
            The exclusive place of jurisdiction is Basel, Switzerland, to the extent permitted
            by mandatory law.
          </p>
        </Section>

        <Section title="10. Contact">
          <p>Questions about these terms: tracethewhales@gmail.com.</p>
        </Section>
      </div>
    </PageShell>
  );
}
