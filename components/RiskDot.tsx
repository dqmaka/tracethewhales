import { colors } from "./theme";
import { InfoTooltip } from "./InfoTooltip";

/**
 * Compact list-row version of the token detail page's mint/freeze authority
 * badges (see app/tokens/[mint]/page.tsx's AuthorityBadge) — a small dot
 * instead of a full text pill, since list rows (Signals, Token Flows) don't
 * have room for two badges per row. Renders nothing when both lookups
 * failed (null) rather than showing a misleading "safe" dot for unverified
 * data.
 */
export function RiskDot({
  mintAuthorityActive,
  freezeAuthorityActive,
}: {
  mintAuthorityActive: boolean | null;
  freezeAuthorityActive: boolean | null;
}) {
  if (mintAuthorityActive === null && freezeAuthorityActive === null) return null;
  const risky = mintAuthorityActive === true || freezeAuthorityActive === true;

  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: risky ? colors.coral : colors.mint,
          boxShadow: risky ? `0 0 6px ${colors.coral}` : "none",
          flexShrink: 0,
        }}
      />
      <InfoTooltip
        text={
          risky
            ? "Mint or freeze authority is still active on this token — the deployer can still inflate supply or freeze holder funds at will."
            : "Mint and freeze authority are both renounced — the deployer can no longer inflate supply or freeze funds this way."
        }
      />
    </span>
  );
}
