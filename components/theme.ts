export const colors = {
  bg: "#070812",
  panel: "#0D101A",
  panelSoft: "#0A0C15",
  line: "rgba(255,255,255,0.06)",
  lineStrong: "rgba(255,255,255,0.1)",
  text: "#EDEFF7",
  textDim: "#9AA1B8",
  textFaint: "#5B6178",
  cyan: "#27E8FF",
  mint: "#35F5A0",
  violet: "#8B5CF6",
  coral: "#FF7A6B",
} as const;

export const mono = "'JetBrains Mono', 'SF Mono', monospace";

export type Tone = "mint" | "cyan" | "violet" | "coral";

export const toneColor: Record<Tone, string> = {
  mint: colors.mint,
  cyan: colors.cyan,
  violet: colors.violet,
  coral: colors.coral,
};
