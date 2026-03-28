/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        parchment: "#f8f3e7",
        "parchment-dark": "#d6c9a8",
        ink: "#3b2f1e",
      },
      boxShadow: {
        "inner-parchment": "inset 0 1px 4px rgba(0,0,0,0.25)",
        card: "0 2px 6px rgba(0,0,0,0.25)",
      },
      fontFamily: {
        title: ['"Cinzel"', "serif"],
      },
    },
  },
  plugins: [],
};