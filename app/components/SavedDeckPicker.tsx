"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { deckFormatLabel } from "@/lib/deckText";

interface DeckListItem {
    id: number;
    name: string;
    format: string | null;
    main: number;
    side: number;
}

/** A saved deck as GET /api/decks/[id] returns it. */
export interface PickedDeck {
    id: number;
    name: string;
    format: string | null;
    decklist: string;
}

/**
 * Deck Check's "Add existing deck": a list of your saved decks to drop into a
 * slot.
 *
 * Rendered as a button plus a full-width panel, both inside the deck box's
 * flex-wrap header row. The panel is order-last and basis-full, so it drops
 * onto its own line under the whole row rather than wedging itself between
 * this button and the next one.
 *
 * The list is fetched each time the panel opens rather than once on mount, so
 * a deck saved from a slot a moment ago (or in another tab) is in it, and a
 * signed-in visitor who never opens it costs no request.
 *
 * Signed out it is a sign-in link instead — the one sign-in prompt for the
 * whole deck box, covering saving slots too (see DeckSlotSave).
 *
 * Only ever rendered where auth is configured, because of useSession; see
 * DeckSlotSave.
 */
export default function SavedDeckPicker({
    addedIds,
    onPick,
}: {
    /** Saved decks already in a slot, shown as added rather than offered twice. */
    addedIds: readonly number[];
    onPick: (deck: PickedDeck) => void;
}) {
    const { data: session, status } = useSession();
    const [open, setOpen] = useState(false);
    const [decks, setDecks] = useState<DeckListItem[] | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<number | null>(null);

    // While the session is still being read, show nothing rather than a
    // sign-in link that flashes and disappears for someone who is signed in.
    if (status === "loading") return null;

    if (!session?.user) {
        return (
            <p className="order-last basis-full text-sm text-ink/70">
                <a
                    href="/signin?callbackUrl=%2Fdeck-check"
                    className="text-brand underline underline-offset-2 hover:text-brand-dark"
                >
                    Sign in
                </a>{" "}
                to add decks from your Decks tab, or to save these to it.
            </p>
        );
    }

    const load = async () => {
        setMessage(null);
        try {
            const res = await fetch("/api/decks");
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setMessage(data.error ?? "Could not load your decks.");
                return;
            }
            setDecks(Array.isArray(data.decks) ? data.decks : []);
        } catch {
            setMessage("Could not load your decks.");
        }
    };

    const toggle = () => {
        const next = !open;
        setOpen(next);
        if (next) void load();
    };

    const pick = async (id: number) => {
        setBusyId(id);
        setMessage(null);
        try {
            const res = await fetch(`/api/decks/${id}`);
            if (res.status === 401) {
                setMessage("Sign in again to open your saved decks.");
            } else if (!res.ok) {
                setMessage(res.status === 404 ? "That deck no longer exists." : "Could not open that deck.");
            } else {
                const { deck } = await res.json();
                onPick({ id: deck.id, name: deck.name, format: deck.format ?? null, decklist: deck.decklist });
                setOpen(false);
            }
        } catch {
            setMessage("Could not open that deck.");
        }
        setBusyId(null);
    };

    return (
        <>
            <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                className="shrink-0 whitespace-nowrap px-4 py-2 bg-parchment rounded shadow-inner-parchment text-ink font-title hover:bg-parchment-dark"
            >
                {open ? "Hide saved decks" : "Add existing deck"}
            </button>

            {open && (
                <div className="order-last basis-full bg-parchment rounded shadow-inner-parchment p-3 sm:p-4 space-y-2">
                    <p className="font-title text-lg">Your saved decks</p>
                    {message && (
                        <p className="text-sm text-red-700" role="alert">
                            {message}
                        </p>
                    )}
                    {decks === null ? (
                        !message && <p className="text-sm text-ink/60">Loading your decks...</p>
                    ) : decks.length === 0 ? (
                        <p className="text-sm text-ink/70">
                            Nothing saved yet. Keep decks on the{" "}
                            <Link href="/decks" className="text-brand underline underline-offset-2 hover:text-brand-dark">
                                Decks
                            </Link>{" "}
                            tab, or paste one into a slot and press Save to Decks.
                        </p>
                    ) : (
                        <ul className="space-y-1 max-h-80 overflow-y-auto">
                            {decks.map((d) => {
                                const added = addedIds.includes(d.id);
                                return (
                                    <li key={d.id}>
                                        <button
                                            type="button"
                                            onClick={added || busyId !== null ? undefined : () => void pick(d.id)}
                                            disabled={added || busyId !== null}
                                            className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-brass/20 disabled:hover:bg-transparent disabled:opacity-60 [overflow-wrap:anywhere]"
                                        >
                                            <span className="font-semibold">{d.name}</span>{" "}
                                            <span className="text-ink/60">
                                                {d.format ? `${deckFormatLabel(d.format)} · ` : ""}
                                                {d.main} main{d.side ? ` + ${d.side} side` : ""}
                                                {added ? " · already added" : busyId === d.id ? " · adding..." : ""}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}
        </>
    );
}
