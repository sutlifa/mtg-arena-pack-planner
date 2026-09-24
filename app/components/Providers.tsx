"use client";

import { SessionProvider } from "next-auth/react";

/**
 * Session context for client components.
 *
 * The NFL app reads the session server-side with `auth()`, which is the more
 * direct approach when every page is per-user. This app is the other way
 * round: every page but /signin and /profile is statically prerendered, and the tools
 * work perfectly well signed out. Calling `auth()` in the root layout reads
 * cookies, which would turn every one of those pages dynamic to render a
 * single nav button.
 *
 * So the session is fetched client-side instead. The pages stay static, and
 * the only cost is that the nav button resolves a moment after load.
 * Anything that actually gates on identity — the save endpoints — checks the
 * session on the server, where it cannot be spoofed.
 */
export default function Providers({
    children,
    authEnabled,
}: {
    children: React.ReactNode;
    authEnabled: boolean;
}) {
    // SessionProvider fetches /api/auth/session as soon as it mounts. On a
    // deployment with no Google credentials that endpoint returns 500, so
    // mounting it unconditionally meant every visitor triggered two failing
    // requests and a console error on every page load, even though no
    // sign-in UI was rendered. When auth is off there is no session to
    // provide, so the provider is skipped entirely.
    if (!authEnabled) return <>{children}</>;

    return <SessionProvider>{children}</SessionProvider>;
}
