import { PageShell } from "@/components/PageShell";
import { NavBar } from "@/components/NavBar";
import { colors } from "@/components/theme";

export const metadata = { title: "Disclaimer — TraceTheWhales" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.7, color: colors.textDim }}>{children}</div>
    </section>
  );
}

export default function DisclaimerPage() {
  return (
    <PageShell>
      <NavBar />
      <div style={{ maxWidth: 720, margin: "0 auto", paddingBottom: 40 }}>
        <div style={{ margin: "24px 0 4px" }}>
          <div style={{ fontSize: 21, fontWeight: 500, letterSpacing: "-0.3px" }}>Disclaimer</div>
          <div style={{ fontSize: 12.5, color: colors.textFaint, marginTop: 4 }}>
            Last updated: September 15, 2026. Please read this in full before using TraceTheWhales or acting on
            anything it publishes.
          </div>
        </div>

        <div
          style={{
            marginTop: 20,
            padding: "14px 16px",
            borderRadius: 12,
            background: "rgba(255,122,107,0.08)",
            border: `1px solid rgba(255,122,107,0.25)`,
            fontSize: 13,
            color: colors.text,
            lineHeight: 1.6,
          }}
        >
          <strong>Nothing on this website or in the TraceTheWhales Telegram channel is financial, investment,
          legal, or tax advice.</strong> It is an automated, informational on-chain analytics tool. You are solely
          responsible for any decision you make.
        </div>

        <Section title="1. No financial advice">
          <p>
            TraceTheWhales publishes automated observations about public Solana blockchain activity — wallet
            behavior, token flows, and derived &quot;signals&quot; and &quot;conviction scores&quot;. None of this
            is a recommendation to buy, sell, or hold any token or asset, and none of it is prepared with your
            individual financial situation in mind. Nothing here constitutes investment advice, a solicitation, or
            an offer to transact in any security or asset, in any jurisdiction.
          </p>
        </Section>

        <Section title="2. High risk, possible total loss">
          <p>
            Cryptocurrencies and tokens on Solana — especially newly-launched, low-liquidity, or low-market-cap
            tokens of the kind this tool often surfaces — are extremely volatile and speculative. You can lose some
            or all of any money you put into them. Only ever risk money you can afford to lose completely, and
            do your own independent research (DYOR) before acting on anything you see here.
          </p>
        </Section>

        <Section title="3. Signals and scores can be wrong">
          <p>
            &quot;Smart Score&quot;, &quot;Conviction&quot;, wallet discovery, and bot-filtering are all produced
            by heuristics and automated pattern-matching, not human judgment or guaranteed-accurate classification.
            A wallet labeled &quot;smart money&quot; can turn out to be a bot, an insider acting on non-public
            information, or simply lucky. A token can be flagged despite having low liquidity, a live mint or
            freeze authority, or other red flags our checks failed to catch. We do not warrant the accuracy,
            completeness, or timeliness of any score, label, or alert.
          </p>
        </Section>

        <Section title="4. Third-party data">
          <p>
            Prices, liquidity, volume, wallet activity, and token metadata are sourced from third-party providers
            (including Helius, Birdeye, DexScreener, GeckoTerminal, FOMO, and the Telegram platform). We do not
            control these providers and cannot guarantee their data is accurate, complete, or available at any
            given time. Outages, rate limits, or errors on their side can cause our own numbers to be delayed,
            incomplete, or wrong.
          </p>
        </Section>

        <Section title="5. Past performance is not indicative of future results">
          <p>
            The figures shown on the Performance page are retrospective estimates of how tokens moved after we
            pushed a signal — modeled with assumed slippage and gas costs, not verified real trades — and they
            describe what already happened, not what will happen next. A strong historical track record (or a
            weak one) is not a promise about how future signals will perform.
          </p>
        </Section>

        <Section title="6. No liability">
          <p>
            To the maximum extent permitted by applicable law, the operator of TraceTheWhales accepts no
            responsibility or liability for any direct, indirect, incidental, or consequential loss or damage —
            including trading losses — arising from your use of, or reliance on, this website, its Telegram
            channel, or any content, alert, or signal it publishes.
          </p>
        </Section>

        <Section title="7. Contact">
          <p>Questions about this disclaimer: tracethewhales@gmail.com.</p>
        </Section>
      </div>
    </PageShell>
  );
}
