import type { ReactNode } from "react";
import { Footer } from "./Footer";

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="ttw4"
      style={{
        minHeight: "100vh",
        width: "100%",
        background: "#070812",
        color: "#EDEFF7",
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: "0 20px 40px",
        overflowX: "hidden",
      }}
    >
      <div className="ttw4-page-content" style={{ maxWidth: 1040, margin: "0 auto" }}>
        {children}
        <Footer />
      </div>
    </div>
  );
}
