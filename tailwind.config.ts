import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Parchment palette — soft, muted neutral tones
        parchment: {
          DEFAULT: "#f7f4ee",   // light neutral for inputs/cards
          dark: "#ece6d9",      // slightly deeper neutral for section backgrounds
        },
        ink: "#332b22",         // warm charcoal for body text
        // Interactive/active accent — muted teal, used for selected states,
        // toggles, and slider accents instead of the old fire-orange tone.
        brand: {
          DEFAULT: "#3f5d5b",
          dark: "#2f4645",
        },
        // Hairline borders/dividers
        line: "#d8d0bd",
      },
      fontFamily: {
        // "font-title" → a clean serif for headings; no external font load.
        title: ["Georgia", "Cambria", "serif"],
      },
      boxShadow: {
        // Outer card shadow — soft and subtle
        card: "0 2px 10px rgba(51, 43, 34, 0.12)",
        // Inner shadow for text areas / inset parchment boxes
        "inner-parchment": "inset 0 1px 4px rgba(51, 43, 34, 0.10)",
      },
    },
  },
  plugins: [],
};

export default config;