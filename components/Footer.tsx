import Link from "next/link";
import { colors } from "./theme";

/** Legal pages (Disclaimer, Terms) deliberately live here, not in the main
 * NavBar — they're not a core product page a user navigates between, just
 * something that needs to be reachable and citable (e.g. from the Telegram
 * channel bio) from every page. */
export function Footer() {
  return (
    <footer
      style={{
        marginTop: 48,
        paddingTop: 20,
        borderTop: `1px solid ${colors.line}`,
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: 11.5,
        color: colors.textFaint,
      }}
    >
      <span>© {new Date().getFullYear()} TraceTheWhales</span>
      <div style={{ display: "flex", gap: 16 }}>
        <Link href="/disclaimer" style={{ color: colors.textFaint, textDecoration: "none" }}>
          Disclaimer
        </Link>
        <Link href="/terms" style={{ color: colors.textFaint, textDecoration: "none" }}>
          Terms of Service
        </Link>
      </div>
    </footer>
  );
}
