import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        heading: ["Space Grotesk", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["SF Mono", "Cascadia Code", "Cascadia Mono", "Consolas", "Liberation Mono", "monospace"]
      },
      colors: {
        surface: "rgb(var(--vos-surface) / <alpha-value>)",
        panel: "rgb(var(--vos-panel) / <alpha-value>)",
        line: "rgb(var(--vos-border) / <alpha-value>)",
        accent: "rgb(var(--vos-primary) / <alpha-value>)",
        verified: "rgb(var(--vos-verified) / <alpha-value>)",
        risk: "rgb(var(--vos-risk) / <alpha-value>)",
        danger: "rgb(var(--vos-danger) / <alpha-value>)",
        unknown: "rgb(var(--vos-unknown) / <alpha-value>)"
      }
    }
  },
  plugins: []
};

export default config;
