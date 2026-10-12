"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { deckFormatLabel } from "@/lib/deckText";

export interface DeckListItem {
    id: number;
    name: string;
    format: string | null;
    main: number;
    side: number;
    updated_at: string;
}

/** What a successful save wrote, as the server normalised it. */
export interface SavedDeck {
    id: number;
    name: string;
    decklist: string;
    format: string | null;
}

/**
 * Saving decks, and the list of the ones you've saved, on the Decks page.
 *
 * Only ever rendered when auth is configured: useSession throws without a
 * SessionProvider, and the provider isn't mounted on a deployment without
 * Google credentials (see Providers and lib/authConfig). Everything else on
 * the page — pasting, the split, sending a deck to the other tools — lives
 * in DeckBuilder and works signed out.
 *
 * The open deck itself (which row Save updates, the unsaved-changes check)
 * is owned by DeckBuilder, because "New deck", Delete and opening from the
 * profile all change it too. This panel just saves what it's given and
 * reports back.
 */
export default function DeckSaves({
    decklist,
    format,
    draftName,
    open,
    dirty,
    canSave,
    listVersion,
    onSaved,
    onPick,
}: {
    /** The editor's list, normalised. */
    decklist: string;
    format: string | null;
    /** The name typed for a deck that isn't saved yet. */
    draftName: string;
    open: { id: number; name: string } | null;
    dirty: boolean;
    /** False while there's nothing savable (no cards, or a link not yet imported). */
    canSave: boolean;
    /** Bumped by the page after a duplicate or delete, to re-read the list. */
    listVersion: number;
    onSaved: (saved: SavedDeck) => void;
    onPick: (id: number) => void;
}) {
    const { data: session } = useSession();
    const signedIn = Boolean(session?.user);

    const [decks, setDecks] = useState<DeckListItem[]>([]);
    const [listError, setListError] = useState<string | null>(null);
    const [refreshes, setRefreshes] = useState(0);
    const [naming, setNaming] = useState(false);
    const [newName, setNewName] = useState("");
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!signedIn) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/decks");
                if (cancelled) return;
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    setListError(data.error ?? "Could not load your decks.");
                    return;
                }
                const data = await res.json();
                if (cancelled) return;
                setDecks(Array.isArray(data.decks) ? data.decks : []);
                setListError(null);
            } catch {
                if (!cancelled) setListError("Could not load your decks.");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [signedIn, listVersion, refreshes]);

    if (!signedIn) {
        return (
            <div className="bg-parchment-dark shadow-card rounded-lg p-4 sm:p-6 space-y-2">
                <h2 className="text-2xl font-title">Your decks</h2>
                <p className="text-sm text-ink/75 leading-relaxed">
                    Everything above works without an account.{" "}
                    <a
                        href="/signin?callbackUrl=%2Fdecks"
                        className="text-brand underline underline-offset-2 hover:text-brand-dark"
                    >
                        Sign in to save
                    </a>{" "}
                    your decks to your profile and open them on any device. What you&apos;ve typed is
                    kept in this browser while you sign in.
                </p>
            </div>
        );
    }

    const findByName = (n: string) =>
        decks.find((d) => d.name.trim().toLowerCase() === n.trim().toLowerCase());

    /**
     * POST. The first save of an unsaved deck is the name upsert (and the
     * panel warns when that will update an existing deck). "Save as new" is
     * `createOnly`: it promised a second deck, so a name already in use is
     * refused — here when the list shows it, and by the server's 409 when it
     * doesn't (another tab, a list not yet refreshed).
     */
    const saveAs = async (name: string, createOnly: boolean) => {
        const trimmed = name.trim();
        if (!trimmed) {
            setMessage("Give the deck a name first.");
            return;
        }
        const taken = createOnly ? findByName(trimmed) : undefined;
        if (taken) {
            setMessage(`You already have a deck called "${taken.name}" — pick another name.`);
            return;
        }
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch("/api/decks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: trimmed, decklist, format, createOnly }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.status === 401) {
                setMessage("Sign in again to save.");
            } else if (!res.ok) {
                setMessage(data.error ?? "Could not save that deck.");
            } else {
                setMessage(`Saved "${data.name}".`);
                setNaming(false);
                onSaved({ id: data.id, name: data.name, decklist: data.decklist, format: data.format ?? null });
                setRefreshes((n) => n + 1);
            }
        } catch {
            setMessage("Could not save that deck.");
        }
        setSaving(false);
    };

    /** PUT: the open deck, keeping its name. */
    const saveOpen = async () => {
        if (!open) return;
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch(`/api/decks/${open.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ decklist, format }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.status === 401) {
                setMessage("Sign in again to save.");
            } else if (res.status === 404) {
                setMessage('That deck no longer exists — use "Save as new" to keep this.');
            } else if (!res.ok) {
                setMessage(data.error ?? "Could not save that deck.");
            } else {
                setMessage(`Saved "${data.name}".`);
                onSaved({ id: data.id, name: data.name, decklist: data.decklist, format: data.format ?? null });
                setRefreshes((n) => n + 1);
            }
        } catch {
            setMessage("Could not save that deck.");
        }
        setSaving(false);
    };

    // Saving a new deck under a name already in the list updates that deck
    // (the same name upsert guides and comparisons use). Said up front, so it
    // isn't a surprise.
    const clash = !open && draftName.trim() ? findByName(draftName) : undefined;
    // In the Save-as-new box the same clash is a refusal, not a warning —
    // that box promises a second deck. Checked against what's typed there.
    const newNameClash = naming && newName.trim() ? findByName(newName) : undefined;

    const buttonClass =
        "px-5 py-2 rounded shadow-card font-title disabled:opacity-50 disabled:cursor-not-allowed ";

    return (
        <div className="bg-parchment-dark shadow-card rounded-lg p-4 sm:p-6 space-y-4">
            <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                    {open ? (
                        <>
                            <button
                                type="button"
                                onClick={saving ? undefined : saveOpen}
                                // Nothing changed is nothing to save; the
                                // label says so rather than offering a no-op.
                                disabled={saving || !canSave || !dirty}
                                className={buttonClass + "bg-brand text-midnight-light hover:bg-brand-dark"}
                            >
                                {saving ? "Saving..." : dirty ? "Save changes" : "Saved"}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setNewName(`${open.name} (copy)`);
                                    setMessage(null);
                                    setNaming(true);
                                }}
                                disabled={saving || !canSave}
                                className={buttonClass + "bg-parchment text-ink hover:bg-parchment/70"}
                            >
                                Save as new...
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={saving ? undefined : () => saveAs(draftName, false)}
                            disabled={saving || !canSave}
                            className={buttonClass + "bg-brand text-midnight-light hover:bg-brand-dark"}
                        >
                            {saving ? "Saving..." : "Save deck"}
                        </button>
                    )}
                </div>

                {!open && clash && (
                    <p className="text-xs text-amber-700 [overflow-wrap:anywhere]">
                        You already have a deck called &quot;{clash.name}&quot; — saving updates it.
                    </p>
                )}

                {naming && (
                    <div className="bg-parchment rounded shadow-inner-parchment p-3 sm:p-4 space-y-3 max-w-lg">
                        <label className="block">
                            <span className="text-sm text-ink/70">Name for the new copy</span>
                            <input
                                type="text"
                                autoFocus
                                value={newName}
                                maxLength={120}
                                onChange={(e) => setNewName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        void saveAs(newName, true);
                                    }
                                    if (e.key === "Escape") setNaming(false);
                                }}
                                className="mt-1 w-full px-3 py-2 rounded bg-parchment-dark text-ink shadow-inner-parchment"
                            />
                        </label>
                        {newNameClash ? (
                            <p className="text-xs text-amber-700 [overflow-wrap:anywhere]">
                                You already have a deck called &quot;{newNameClash.name}&quot; — pick
                                another name.
                            </p>
                        ) : (
                            <p className="text-xs text-ink/55 [overflow-wrap:anywhere]">
                                This saves a second deck and leaves &quot;{open?.name}&quot; as it was.
                            </p>
                        )}
                        <div className="flex gap-2 justify-end">
                            <button
                                type="button"
                                onClick={() => setNaming(false)}
                                className="px-4 py-2 rounded text-sm text-ink/70 hover:bg-parchment-dark"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={saving ? undefined : () => saveAs(newName, true)}
                                disabled={saving || Boolean(newNameClash)}
                                className="px-5 py-2 rounded font-title bg-brand text-midnight-light hover:bg-brand-dark disabled:opacity-50"
                            >
                                {saving ? "Saving..." : "Save"}
                            </button>
                        </div>
                    </div>
                )}

                {message && (
                    <p className="text-sm text-ink/80 [overflow-wrap:anywhere]" role="status">
                        {message}
                    </p>
                )}
            </div>

            <div className="border-t border-brass/25 pt-4 space-y-2">
                <h2 className="text-2xl font-title">Your decks</h2>
                {listError ? (
                    <p className="text-sm text-red-700">{listError}</p>
                ) : decks.length === 0 ? (
                    <p className="text-sm text-ink/70">
                        Nothing saved yet. Paste a list above, name it and press Save deck.
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {decks.map((d) => {
                            const isOpen = open?.id === d.id;
                            return (
                                <li
                                    key={d.id}
                                    className={
                                        "flex flex-wrap items-center justify-between gap-3 rounded shadow-inner-parchment p-3 " +
                                        (isOpen ? "bg-brass/20" : "bg-parchment")
                                    }
                                >
                                    <div className="min-w-0">
                                        <p className="font-title text-lg truncate" title={d.name}>
                                            {d.name}
                                        </p>
                                        <p className="text-sm text-ink/60">
                                            {d.format ? `${deckFormatLabel(d.format)} · ` : ""}
                                            {d.main} main{d.side ? ` + ${d.side} side` : ""}
                                        </p>
                                    </div>
                                    {isOpen ? (
                                        <span className="px-3 py-2 text-sm text-ink/70">Open now</span>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => onPick(d.id)}
                                            className="px-4 py-2 rounded font-title bg-brand text-midnight-light hover:bg-brand-dark"
                                        >
                                            Open
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
