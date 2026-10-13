"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

interface CollectionSummary {
    id: number;
    name: string;
    arena_mode: boolean;
    /** Lines in the stored text — one per card, since collections are saved merged. */
    cards: number | null;
}

/** A saved collection as GET /api/collections/[id] returns it. */
export interface OpenedCollection {
    id: number;
    name: string;
    raw_text: string;
    arena_mode: boolean;
}

/**
 * One mode's worth of saved collections.
 *
 * Defined at module scope rather than inside the component: a component
 * created during render is a brand-new type on every render, so React
 * unmounts and remounts the whole subtree each time, throwing away its state
 * and DOM.
 */
function CollectionGroup({
    title,
    items,
    activeId,
    busyId,
    onPick,
}: {
    title: string;
    items: CollectionSummary[];
    activeId: number | null;
    busyId: number | null;
    onPick: (id: number) => void;
}) {
    return (
        <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/60 mb-1">
                {title} ({items.length})
            </p>
            {items.length === 0 ? (
                <p className="text-sm text-ink/50 px-2 py-1">None saved.</p>
            ) : (
                <ul className="space-y-1">
                    {items.map((c) => {
                        const active = c.id === activeId;
                        // array_length() of an empty collection is NULL in SQL.
                        const count = c.cards ?? 0;
                        return (
                            <li key={c.id}>
                                <button
                                    type="button"
                                    onClick={active || busyId !== null ? undefined : () => onPick(c.id)}
                                    disabled={active || busyId !== null}
                                    className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-brass/20 disabled:hover:bg-transparent disabled:opacity-60 [overflow-wrap:anywhere]"
                                >
                                    <span className="font-semibold">{c.name}</span>{" "}
                                    <span className="text-ink/60">
                                        ({count.toLocaleString()} different card{count === 1 ? "" : "s"})
                                        {active ? " · in use" : busyId === c.id ? " · loading..." : ""}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

/**
 * Deck Check's "Load collection": pick one of your saved collections, Arena
 * and Paper listed separately because they are genuinely different lists.
 *
 * Loading one here only changes what Deck Check compares against — the
 * Collection page keeps its own collection (lib/deckCheckCollection says why).
 * What a load does to the page — the mode switch, a re-run — is the parent's
 * call (DeckCheck.loadSavedCollection), because the same load also arrives as
 * ?collection= from the profile.
 *
 * Fetched when the panel opens, and laid out the same way (order-last,
 * full width), like SavedDeckPicker. Signed out it's a
 * sign-in link. Only ever rendered where auth is configured (useSession).
 */
export default function SavedCollectionPicker({
    activeId,
    onPick,
}: {
    /** The saved collection already in use, if it is one. */
    activeId: number | null;
    onPick: (c: OpenedCollection) => void;
}) {
    const { data: session, status } = useSession();
    const [open, setOpen] = useState(false);
    const [collections, setCollections] = useState<CollectionSummary[] | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<number | null>(null);

    if (status === "loading") return null;

    if (!session?.user) {
        return (
            <a
                href="/signin?callbackUrl=%2Fdeck-check"
                className="px-4 py-2 rounded font-title text-sm bg-parchment text-ink shadow-card hover:bg-parchment/70"
            >
                Sign in to load a saved collection
            </a>
        );
    }

    const load = async () => {
        setMessage(null);
        try {
            const res = await fetch("/api/collections");
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setMessage(data.error ?? "Could not load your collections.");
                return;
            }
            setCollections(Array.isArray(data.collections) ? data.collections : []);
        } catch {
            setMessage("Could not load your collections.");
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
            const res = await fetch(`/api/collections/${id}`);
            if (res.status === 401) {
                setMessage("Sign in again to open your saved collections.");
            } else if (!res.ok) {
                setMessage(
                    res.status === 404 ? "That collection no longer exists." : "Could not open that collection."
                );
            } else {
                const { collection } = await res.json();
                onPick(collection);
                setOpen(false);
            }
        } catch {
            setMessage("Could not open that collection.");
        }
        setBusyId(null);
    };

    return (
        <>
            <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                className="px-4 py-2 rounded font-title text-sm bg-parchment text-ink shadow-card hover:bg-parchment/70"
            >
                {open ? "Hide saved collections" : "Load collection"}
            </button>

            {open && (
                <div className="order-last basis-full bg-parchment rounded shadow-inner-parchment p-3 sm:p-4 space-y-3">
                    <div>
                        <p className="font-title text-lg">Your saved collections</p>
                        <p className="text-xs text-ink/60">
                            Deck Check switches to the collection&apos;s mode. Your decks and your Collection
                            page stay as they are.
                        </p>
                    </div>
                    {message && (
                        <p className="text-sm text-red-700" role="alert">
                            {message}
                        </p>
                    )}
                    {collections === null ? (
                        !message && <p className="text-sm text-ink/60">Loading your collections...</p>
                    ) : collections.length === 0 ? (
                        <p className="text-sm text-ink/70">
                            Nothing saved yet. Save one from the{" "}
                            <Link
                                href="/collection"
                                className="text-brand underline underline-offset-2 hover:text-brand-dark"
                            >
                                Collection
                            </Link>{" "}
                            page, or paste one here with New and press Save to Collection.
                        </p>
                    ) : (
                        <div className="grid sm:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                            <CollectionGroup
                                title="Arena"
                                items={collections.filter((c) => c.arena_mode)}
                                activeId={activeId}
                                busyId={busyId}
                                onPick={(id) => void pick(id)}
                            />
                            <CollectionGroup
                                title="Paper"
                                items={collections.filter((c) => !c.arena_mode)}
                                activeId={activeId}
                                busyId={busyId}
                                onPick={(id) => void pick(id)}
                            />
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
