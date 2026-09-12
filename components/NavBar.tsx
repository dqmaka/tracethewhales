import Link from "next/link";
import { Bell, Home, Wallet, Zap, BarChart3 } from "lucide-react";
import { colors } from "./theme";

const LINKS = [
  { label: "Overview", href: "/", icon: Home },
  { label: "Wallets", href: "/wallets", icon: Wallet },
  { label: "Signals", href: "/signals", icon: Zap },
  { label: "Performance", href: "/performance", icon: BarChart3 },
  { label: "Alerts", href: "/alerts", icon: Bell },
] as const;

const TELEGRAM_URL = "https://t.me/tracethewhales";

function TelegramIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 240 240" aria-hidden="true">
      <path
        d="M54 122.6l114.6-44.2c5.3-2 9.9 1.3 8.2 9.2l-19.5 92c-1.5 6.7-5.5 8.3-11.1 5.2l-30.7-22.6-14.8 14.3c-1.6 1.6-3 3-6.2 3l2.2-31.4 57.2-51.7c2.5-2.2-.5-3.4-3.8-1.2l-70.7 44.6-30.5-9.5c-6.6-2.1-6.7-6.6 1.4-9.7z"
        fill="#fff"
      />
    </svg>
  );
}

export function NavBar({ active }: { active?: "Overview" | "Wallets" | "Signals" | "Performance" | "Alerts" }) {
  return (
    <>
      <nav className="ttw4-nav">
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
          <svg width="24" height="24" viewBox="0 0 26 26" aria-hidden="true">
            <path
              d="M3 15 C4 9 9 6 14 6 C19 6 23 9 25 12 C22 11 20 12 19 14 C21 15 22 17 23 19 C20 19 18 17 17 16 C14 20 8 21 4 18 Z"
              fill="none"
              stroke={colors.cyan}
              strokeWidth="1.3"
            />
          </svg>
          <span style={{ fontSize: 14.5, fontWeight: 500, letterSpacing: "-0.2px" }}>TraceTheWhales</span>
        </Link>
        <div className="ttw4-navlinks">
          {LINKS.map((link) => (
            <Link key={link.label} href={link.href} className={link.label === active ? "active" : ""}>
              {link.label}
            </Link>
          ))}
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: colors.textDim }}>
            Solana
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: colors.mint, display: "inline-block" }} />
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="Telegram channel"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: "#26A5E4",
              flexShrink: 0,
            }}
          >
            <TelegramIcon />
          </a>
          <Bell size={16} color={colors.textDim} />
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${colors.violet}, ${colors.cyan})`,
            }}
          />
        </div>
      </nav>

      {/* Mobile-only fixed bottom tab bar — the links above are CSS-hidden
          below 760px (no room for them inline), so this is the only way to
          navigate between pages on a phone. */}
      <nav className="ttw4-bottomnav">
        {LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <Link key={link.label} href={link.href} className={link.label === active ? "active" : ""}>
              <Icon size={19} />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
