"use client";

import { useContext } from "react";
import { SessionContext } from "next-auth/react";

/**
 * Whether someone is signed in, readable from any client component — with or
 * without a SessionProvider above it.
 *
 * useSession can't be used for this. On a deployment without Google
 * credentials the provider isn't mounted at all (see Providers), and
 * useSession then throws in development and destructures `undefined` in
 * production. That's why every component that calls it (SaveWorkButton,
 * DeckSaves, the pickers) is only ever rendered behind an `authEnabled`
 * check. The leave-guard and the entry chooser are rendered on every
 * deployment, and they need the answer — "can this person save?" — to decide
 * what to offer, so they read the context directly: no provider simply reads
 * as signed out, which is the truth on such a deployment.
 *
 * `loading` is true only while a mounted provider is still fetching the
 * session, so a caller can hold back a sign-in prompt that would flash and
 * vanish for someone who is signed in.
 */
export function useOptionalSession(): { signedIn: boolean; loading: boolean } {
    const value = useContext(SessionContext);
    return {
        signedIn: Boolean(value?.data?.user),
        loading: value?.status === "loading",
    };
}
