import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // This codebase intentionally leans on `any` for the loosely-typed
  // Scryfall JSON data flowing through it; treat it as a warning, not
  // a hard error.
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // scripts/ contains standalone Node/CommonJS build tooling, not app source.
  {
    files: ["scripts/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
