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
        // Parchment palette — warm ivory tones for content areas
        parchment: {
          DEFAULT: "#f7f2e4",   // page/card background
          dark: "#e7dcc2",      // section backgrounds
        },
        ink: "#2b2416",          // rich dark brown for body text

        // Deep forest — the nav header and footer bars that bookend the
        // light content area. This is what gives the site an actual
        // identity instead of reading as an unbranded document.
        midnight: {
          DEFAULT: "#1c2b23",
          light: "#f2ead6",      // cream text for content sitting on forest
        },

        // Brass — the accent stripe under the nav / above the footer, and
        // the active tab. Mid-tone, so anything sitting ON brass uses the
        // dark `ink` color, never the cream.
        brass: {
          DEFAULT: "#b8893a",
          dark: "#966d2b",
          light: "#d4a75c",
          // Text sitting ON a brass fill. Brass is a mid-tone, so AAA is
          // unreachable against it at any darkness; this is the darkest
          // useful stop and lands at ~5.5:1, a comfortable AA pass.
          ink: "#241a08",
        },

        // Mid forest — primary action buttons, the Arena/Paper toggle's
        // "on" state, slider accents, and the selected art-version pill.
        // Dark enough that cream (`midnight-light`) text reads cleanly.
        brand: {
          DEFAULT: "#2f4a3a",
          dark: "#24392c",
          light: "#4a6f57",
        },

        // Hairline borders/dividers on parchment
        line: "#d5c8a8",
      },
      fontFamily: {
        // "font-title" → Playfair Display (loaded via Google Fonts in
        // layout.tsx) — a real display serif with proper lowercase
        // letterforms, legible from button-label sizes up to headings,
        // unlike the old MedievalSharp treatment.
        title: ["Playfair Display", "Georgia", "serif"],
      },
      boxShadow: {
        // Outer card shadow — tinted with the forest tone for cohesion
        card: "0 4px 14px rgba(28, 43, 35, 0.18)",
        // Inner shadow for text areas / inset parchment boxes
        "inner-parchment": "inset 0 2px 6px rgba(43, 36, 22, 0.15)",
      },
    },
  },
  plugins: [],
};

export default config;