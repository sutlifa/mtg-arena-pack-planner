export function resolveName(name: string): string {
  if (!name) return "";
  const key = name.toLowerCase().trim();

  if (typeof window !== "undefined" && window.__CARD_ALIASES__) {
    return window.__CARD_ALIASES__[key] ?? key;
  }

  return key;
}