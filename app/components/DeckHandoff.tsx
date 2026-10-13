"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
    HANDOFF_PATHS,
    decodeHandoff,
    encodeHandoff,
    handoffKey,
    type HandoffDeck,
    type HandoffTarget,
} from "@/lib/deckHandoff";

/** What a ?deck= link says where saved decks can't exist. */
const SAVED_DECKS_OFF = "Saved decks aren't available on this site.";

/**
 * Where a deck should be sent, and the hand-off that gets it there.
 *
 * A saved deck with nothing unsaved goes by id (?deck=<id>), so the receiving
 * page opens what is actually stored. Anything else is left in sessionStorage
 * for that page — never in the address; lib/deckHandoff explains why. Returns
 * the href to navigate to.
 *
 * Writing storage is the side effect here, so this is called from a click
 * handler, never during render.
 */
export function sendDeck(target: HandoffTarget, deck: HandoffDeck, opts: { saved: boolean }): string {
    const path = HANDOFF_PATHS[target];
    if (deck.id !== null && opts.saved) return `${path}?deck=${deck.id}`;
    try {
        sessionStorage.setItem(handoffKey(target), encodeHandoff(deck, Date.now()));
    } catch {
        // Storage unavailable (some private modes): the receiving page simply
        // opens as it would have anyway. Nothing breaks; the deck just
        // doesn't arrive, and the Decks page is still there to copy from.
    }
    return path;
}

/**
 * How a deck arrived. `stored` is true when it was just fetched by id, so it
 * is exactly the saved deck; false for a sessionStorage hand-off, which may
 * carry a saved deck's id *with* edits that were never saved. Deck Check uses
 * it to mark a slot as edited from the start; pages that don't care ignore it.
 */
export interface Arrival {
    stored: boolean;
}

/**
 * Receives a deck on arrival: ?deck=<id> (fetched, so it needs the owner
 * signed in) or the sessionStorage hand-off left by sendDeck.
 *
 * Kept as its own component, wrapped in Suspense by each page, because
 * useSearchParams opts a component out of prerendering and every page that
 * receives a deck is static — the same arrangement as GuideLoader and the
 * Collection page's SavedCollectionLoader.
 *
 * `ready` holds everything back until the page has restored its own state
 * from localStorage. Delivered earlier, the deck would land first and then be
 * overwritten by the restore a moment later, which looks like the button did
 * nothing.
 *
 * Only speaks up when something fails; each page announces a successful
 * arrival in its own words, because only it knows what it did with the deck.
 */
export function DeckHandoffLoader({
    target,
    ready,
    onDeck,
    authEnabled,
}: {
    /** Which hand-off to take. "decks" is the Decks page, which only opens by id. */
    target: HandoffTarget | "decks";
    ready: boolean;
    onDeck: (deck: HandoffDeck, arrival: Arrival) => void;
    /** isAuthConfigured(), from the server page. Without it there are no saved decks. */
    authEnabled: boolean;
}) {
    const searchParams = useSearchParams();
    const deckId = searchParams.get("deck");
    // Tied to the id it describes, as GuideLoader does, so navigating away
    // from the parameter hides a stale message without an effect.
    const [status, setStatus] = useState<{ id: string; message: string } | null>(null);
    const message = status && status.id === (deckId ?? "") ? status.message : null;

    // The parent recreates onDeck every render; a ref keeps it out of the
    // dependency list so this runs once per arrival, not once per keystroke.
    const onDeckRef = useRef(onDeck);
    useEffect(() => {
        onDeckRef.current = onDeck;
    }, [onDeck]);

    useEffect(() => {
        if (!ready) return;

        if (!deckId) {
            if (target === "decks") return;
            // Taken, not just read: removed in the same step, so React
            // StrictMode's second effect run in development (and a reload
            // afterwards) finds nothing and can't deliver the deck twice.
            let raw: string | null = null;
            try {
                raw = sessionStorage.getItem(handoffKey(target));
                sessionStorage.removeItem(handoffKey(target));
            } catch {
                return;
            }
            const deck = decodeHandoff(raw, Date.now());
            if (deck) onDeckRef.current(deck, { stored: false });
            return;
        }

        // A ?deck= link wins over any hand-off, and clears it: the link is
        // the more deliberate of the two, and a hand-off left behind would
        // otherwise fire on the next plain visit.
        if (target !== "decks") {
            try {
                sessionStorage.removeItem(handoffKey(target));
            } catch {
                /* nothing to clear */
            }
        }

        // No sign-in on this deployment means no saved decks to open, so
        // don't ask the server and then tell the user to sign in where they
        // can't. Read from a prop the server page computed with
        // isAuthConfigured() — a plain env read — so the page stays static.
        // The same message covers a 503 below (sign-in on, no database).
        if (!authEnabled) {
            // Set from a timer, not the effect body, so it's an update in
            // response to the URL rather than a render-time cascade.
            const t = setTimeout(() => setStatus({ id: deckId, message: SAVED_DECKS_OFF }), 0);
            return () => clearTimeout(t);
        }

        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/decks/${encodeURIComponent(deckId)}`);
                if (cancelled) return;
                if (res.status === 401) {
                    setStatus({ id: deckId, message: "Sign in to open that saved deck." });
                    return;
                }
                if (res.status === 503) {
                    setStatus({ id: deckId, message: SAVED_DECKS_OFF });
                    return;
                }
                if (res.status === 404 || res.status === 400) {
                    setStatus({ id: deckId, message: "That deck no longer exists." });
                    return;
                }
                if (!res.ok) {
                    setStatus({ id: deckId, message: "Could not open that deck." });
                    return;
                }
                const { deck } = await res.json();
                if (cancelled || typeof deck?.decklist !== "string") return;

                onDeckRef.current(
                    {
                        id: deck.id,
                        name: deck.name,
                        format: deck.format ?? null,
                        decklist: deck.decklist,
                    },
                    { stored: true }
                );

                // Done with the parameter: left in, a reload or Back would
                // open the saved copy again over everything done since. The
                // same native replaceState the other ?id loaders use.
                const url = new URL(window.location.href);
                url.searchParams.delete("deck");
                window.history.replaceState(null, "", url.pathname + url.search + url.hash);
            } catch {
                if (!cancelled) setStatus({ id: deckId, message: "Could not open that deck." });
            }
        })();

        // A cancelled first run (StrictMode, or `ready` flipping) is simply
        // discarded; the run that replaces it fetches again and delivers once.
        return () => {
            cancelled = true;
        };
    }, [ready, deckId, target, authEnabled]);

    if (!message) return null;

    return (
        <p className="sb-noprint text-sm text-center text-red-700" role="status">
            {message}
        </p>
    );
}
