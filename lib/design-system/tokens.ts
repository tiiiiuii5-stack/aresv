export const ventureOSDesignTokens = {
  mode: "dark",
  color: {
    background: "rgb(8 10 13)",
    surface: "rgb(8 10 13)",
    panel: "rgb(15 18 23)",
    panelRaised: "rgb(19 23 29)",
    border: "rgb(48 55 64)",
    borderStrong: "rgb(72 82 94)",
    text: "rgb(244 247 250)",
    textMuted: "rgb(156 163 175)",
    textSubtle: "rgb(107 114 128)",
    primary: "rgb(203 213 225)",
    primaryText: "rgb(8 10 13)",
    verified: "rgb(34 197 94)",
    risk: "rgb(234 179 8)",
    danger: "rgb(239 68 68)",
    unknown: "rgb(148 163 184)",
  },
  typography: {
    family: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: "1.875rem",
    h2: "1.125rem",
    body: "0.875rem",
    small: "0.75rem",
  },
  radius: {
    sm: "0.375rem",
    md: "0.5rem",
    lg: "0.5rem",
  },
  shadow: {
    none: "none",
    minimal: "0 1px 2px rgb(0 0 0 / 0.18)",
  },
} as const;

export type VentureOSDesignTokens = typeof ventureOSDesignTokens;
