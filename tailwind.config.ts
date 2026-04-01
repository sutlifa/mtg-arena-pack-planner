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
        // Parchment palette — warm aged paper tones
        parchment: {
          DEFAULT: "#f5e6c8",   // light parchment for inputs/cards
          dark: "#e8d5a3",      // slightly darker parchment for section backgrounds
        },
        ink: "#2c1a0e",         // deep brown ink for body text
      },
      fontFamily: {
        // "font-title" → Cinzel (loaded via Google Fonts in layout.tsx)
        title: ["Cinzel", "serif"],
      },
      boxShadow: {
        // Outer card shadow — warm amber glow
        card: "0 4px 16px rgba(92, 60, 20, 0.35)",
        // Inner shadow for text areas / inset parchment boxes
        "inner-parchment": "inset 0 2px 8px rgba(92, 60, 20, 0.25)",
      },
    },
  },
  plugins: [],
};

export default config;