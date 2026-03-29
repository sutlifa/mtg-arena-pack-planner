// lib/aliasResolver.ts

declare global {
  interface Window {
    __CARD_ALIASES__?: Record<string, string>;
  }
}

export function resolveName(name: string): string {
  const key = name.toLowerCase().trim();

  if (typeof window !== "undefined" && window.__CARD_ALIASES__) {
    return window.__CARD_ALIASES__[key] ?? key;
  }

  return key;
}