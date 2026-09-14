// lib/authConfig.ts

/**
 * Whether Google sign-in is actually usable in this environment.
 *
 * Read on the server at render time (never in the browser — the secret must
 * not ship to a client bundle) and passed down as a plain boolean prop. When
 * it is false the app hides every sign-in affordance rather than offering a
 * button that leads to a 500: the tools all work signed out, so an
 * unconfigured deployment should simply look like the site did before
 * accounts existed.
 *
 * This is a plain env read, not `cookies()`/`headers()`, so pages that use it
 * stay statically prerenderable.
 */
export function isAuthConfigured(): boolean {
    return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}
