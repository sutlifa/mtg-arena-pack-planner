"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";

/**
 * The sign-in call to action in the homepage's "Start here" section.
 *
 * Only ever rendered when auth is configured: the homepage checks
 * isAuthConfigured() and leaves this out otherwise. That is not optional
 * tidiness — useSession throws without a SessionProvider above it, and
 * Providers.tsx only mounts one when auth is configured, so rendering this
 * on an unconfigured deployment would crash the homepage.
 *
 * The session is read here, in the browser, rather than with auth() in the
 * page, for the reason Providers.tsx gives: auth() reads cookies, and that
 * would turn the homepage dynamic just to choose between two buttons.
 *
 * One button for both "sign up" and "sign in", because with Google they are
 * the same act — the first sign-in creates the account (upsertUser in
 * auth.ts's jwt callback) and every later one finds it. A separate "Sign up"
 * button would lead to the same place and suggest a form that doesn't exist,
 * so the caption says it in words instead.
 *
 * It goes to /signin, not straight to Google, so the privacy note on that
 * page — what is stored from the Google account — is seen before anything is
 * stored. The callback is /profile rather than back here: a returning user
 * signs in to reach their saved work, and a new one lands on an empty
 * profile whose sections each link to the tool that fills them, which is a
 * better next step than the page they just left.
 */

const BUTTON =
    "inline-block px-5 py-2.5 rounded shadow-card font-title bg-brand text-midnight-light hover:bg-brand-dark transition-colors whitespace-nowrap";

/** Button and caption side by side, wrapping under each other on a phone. */
function Row({ action, caption }: { action: React.ReactNode; caption: React.ReactNode }) {
    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
            {action}
            <p className="text-sm text-ink/75 leading-relaxed min-w-0 flex-1 basis-56">{caption}</p>
        </div>
    );
}

const SIGNED_OUT_CAPTION =
    "New here? Your first sign-in creates your account — there's no separate sign-up form.";

export default function StartHereSignIn() {
    const { data: session, status } = useSession();

    // While the session resolves, hold the signed-out row's exact footprint —
    // same button, same caption, invisible — so the cards below don't jump
    // when it arrives. A span rather than a Link, so the placeholder is
    // neither focusable nor prefetching /signin for nothing.
    if (status === "loading") {
        return (
            <div className="invisible" aria-hidden="true">
                <Row
                    action={<span className={BUTTON}>Sign in with Google</span>}
                    caption={SIGNED_OUT_CAPTION}
                />
            </div>
        );
    }

    if (!session?.user) {
        return (
            <Row
                action={
                    <Link href="/signin?callbackUrl=%2Fprofile" className={BUTTON}>
                        Sign in with Google
                    </Link>
                }
                caption={SIGNED_OUT_CAPTION}
            />
        );
    }

    return (
        <Row
            action={
                <Link href="/profile" className={BUTTON}>
                    Go to your profile
                </Link>
            }
            caption="You're signed in. Your saved collections, comparisons and sideboard guides are on your profile."
        />
    );
}
