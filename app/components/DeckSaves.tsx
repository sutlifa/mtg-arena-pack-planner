"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

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
 * The two saves — PUT the open deck by id, or POST a new one by name — shared
 * by the Decks page's save panel (DeckSaves) and the leave-guard's "Save and
 * leave" (DeckSaveAndContinue), so both go through one path with one set of
 * error messages. No useSession here: both callers are only rendered signed
 * in.
 *
 * The first save of an unsaved deck is the name upsert (and the panel warns
 * when that will update an existing deck). "Save as new" is `createOnly`: it
 * promised a second deck, so a name already in use comes back as the
 * server's 409 rather than overwriting a different deck.
 */
function useDeckSave({
    decklist,
    format,
    open,
    onSaved,
    inDialog = false,
}: {
    decklist: string;
    format: string | null;
    open: { id: number; name: string } | null;
    onSaved: (saved: SavedDeck) => void;
    /** In the leave dialog, where "Save as new" isn't offered — see the 404 below. */
    inDialog?: boolean;
}) {
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    /** POST under a name. Resolves true when it saved. */
    const saveAs = async (name: string, createOnly: boolean): Promise<boolean> => {
        const trimmed = name.trim();
        if (!trimmed) {
            setMessage("Give the deck a name first.");
            return false;
        }
        setSaving(true);
        setMessage(null);
        let ok = false;
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
                ok = true;
                onSaved({ id: data.id, name: data.name, decklist: data.decklist, format: data.format ?? null });
            }
        } catch {
            setMessage("Could not save that deck.");
        }
        setSaving(false);
        return ok;
    };

    /** PUT: the open deck, keeping its name. Resolves true when it saved. */
    const saveOpen = async (): Promise<boolean> => {
        if (!open) return false;
        setSaving(true);
        setMessage(null);
        let ok = false;
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
                setMessage(
                    inDialog
                        ? 'That deck no longer exists. Stay, then use "Save as new..." on the page to keep this.'
                        : 'That deck no longer exists — use "Save as new" to keep this.'
                );
            } else if (!res.ok) {
                setMessage(data.error ?? "Could not save that deck.");
            } else {
                setMessage(`Saved "${data.name}".`);
                ok = true;
                onSaved({ id: data.id, name: data.name, decklist: data.decklist, format: data.format ?? null });
            }
        } catch {
            setMessage("Could not save that deck.");
        }
        setSaving(false);
        return ok;
    };

    return { saving, message, setMessage, saveAs, saveOpen };
}

/**
 * The leave-guard's Save button for the Decks page (LeaveGuard's
 * `renderSave`). An open deck is updated in place; a deck that was never
 * saved needs a name, so it gets the same kind of name box the page has,
 * filled in with whatever was typed there. `done` runs only after a save
 * succeeds; a failure shows its message and the dialog stays open.
 */
export function DeckSaveAndContinue({
    decklist,
    format,
    draftName,
    open,
    canSave,
    cannotSaveReason,
    label,
    onSaved,
    done,
}: {
    decklist: string;
    format: string | null;
    draftName: string;
    open: { id: number; name: string } | null;
    canSave: boolean;
    /** Why there's nothing savable, said in place of the button. */
    cannotSaveReason: string;
    label: string;
    onSaved: (saved: SavedDeck) => void;
    done: () => void;
}) {
    const { saving, message, saveAs, saveOpen } = useDeckSave({ decklist, format, open, onSaved, inDialog: true });
    const [name, setName] = useState(draftName);

    if (!canSave) {
        return <p className="w-full text-sm text-amber-800 [overflow-wrap:anywhere]">{cannotSaveReason}</p>;
    }

    const go = async () => {
        const ok = open ? await saveOpen() : await saveAs(name, false);
        if (ok) done();
    };

    return (
        <div className="w-full space-y-2">
            {!open && (
                <label className="block text-left">
                    <span className="text-sm text-ink/70">Name for this deck</span>
                    <input
                        type="text"
                        value={name}
                        maxLength={120}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                void go();
                            }
                        }}
                        placeholder="Mono-Red Aggro"
                        className="mt-1 w-full px-3 py-2 rounded bg-parchment-dark text-ink shadow-inner-parchment"
                    />
                    <span className="block text-xs text-ink/55 mt-1">
                        Reusing a name updates that deck instead of making a second one.
                    </span>
                </label>
            )}
            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={saving ? undefined : () => void go()}
                    disabled={saving}
                    className="px-4 py-2 rounded font-title text-sm bg-brand text-midnight-light hover:bg-brand-dark disabled:opacity-50"
                >
                    {saving ? "Saving..." : label}
                </button>
            </div>
            {message && (
                <p className="text-sm text-ink/80 [overflow-wrap:anywhere]" role="status">
                    {message}
                </p>
            )}
        </div>
    );
}

/**
 * Saving decks on the Decks page.
 *
 * Only ever rendered when auth is configured: useSession throws without a
 * SessionProvider, and the provider isn't mounted on a deployment without
 * Google credentials (see Providers and lib/authConfig). Everything else on
 * the page — pasting, the split, sending a deck to the other tools — lives
 * in DeckBuilder and works signed out.
 *
 * The open deck itself (which row Save updates, the unsaved-changes check)
 * is owned by DeckBuilder, because "New deck", Delete and opening a saved
 * deck all change it too. This panel just saves what it's given and reports
 * back.
 *
 * It used to end with the full list of your saved decks, each with an Open
 * button. That list grew to dominate the page, so it moved: opening a saved
 * deck is now the page's chooser (EntryChooser), shown on arrival and from
 * "Open another...". The list is still fetched here, though not shown,
 * because a new deck's name is checked against it — saving under a name you
 * already use updates that deck, and the panel says so before you press
 * Save.
 */
export default function DeckSaves({
    decklist,
    format,
    draftName,
    open,
    dirty,
    canSave,
    blockedReason = null,
    listVersion,
    onSaved,
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
    /**
     * Why Save is off when the deck itself is fine to look at — names that
     * aren't real cards. Said here, beside the disabled button, because a
     * greyed-out Save with no reason reads as broken. Left null for "no
     * cards yet", which the page already explains above.
     */
    blockedReason?: string | null;
    /** Bumped by the page after a duplicate, delete or rename, to re-read the names. */
    listVersion: number;
    onSaved: (saved: SavedDeck) => void;
}) {
    const { data: session } = useSession();
    const signedIn = Boolean(session?.user);

    const [decks, setDecks] = useState<DeckListItem[]>([]);
    const [refreshes, setRefreshes] = useState(0);
    const [naming, setNaming] = useState(false);
    const [newName, setNewName] = useState("");

    const { saving, message, setMessage, saveAs: postDeck, saveOpen } = useDeckSave({
        decklist,
        format,
        open,
        onSaved: (saved) => {
            setNaming(false);
            onSaved(saved);
            setRefreshes((n) => n + 1);
        },
    });

    useEffect(() => {
        if (!signedIn) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/decks");
                if (cancelled || !res.ok) return;
                const data = await res.json();
                if (cancelled) return;
                setDecks(Array.isArray(data.decks) ? data.decks : []);
            } catch {
                // Only the name-clash hint depends on this list, and the
                // server still refuses a clash on "Save as new" without it.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [signedIn, listVersion, refreshes]);

    if (!signedIn) {
        return (
            <div className="bg-parchment-dark shadow-card rounded-lg p-4 sm:p-6 space-y-2">
                <h2 className="text-2xl font-title">Save this deck</h2>
                <p className="text-sm text-ink/75 leading-relaxed">
                    Everything above works without an account.{" "}
                    <a
                        href="/signin?callbackUrl=%2Fdecks"
                        className="text-brand underline underline-offset-2 hover:text-brand-dark"
                    >
                        Sign in to save
                    </a>{" "}
                    your decks to your profile and open them on any device. What you&apos;ve typed is
                    kept in this browser while you sign in; otherwise it&apos;s cleared when you leave
                    this page, after asking.
                </p>
            </div>
        );
    }

    const findByName = (n: string) =>
        decks.find((d) => d.name.trim().toLowerCase() === n.trim().toLowerCase());

    /**
     * "Save as new" promised a second deck, so a name the list already shows
     * is refused here, before the request; the server's 409 covers a list
     * that's out of date (another tab, a deck saved elsewhere).
     */
    const saveAs = async (name: string, createOnly: boolean) => {
        const taken = createOnly && name.trim() ? findByName(name) : undefined;
        if (taken) {
            setMessage(`You already have a deck called "${taken.name}" — pick another name.`);
            return;
        }
        await postDeck(name, createOnly);
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
        <div className="bg-parchment-dark shadow-card rounded-lg p-4 sm:p-6 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
                {open ? (
                    <>
                        <button
                            type="button"
                            onClick={saving ? undefined : () => void saveOpen()}
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
                        onClick={saving ? undefined : () => void saveAs(draftName, false)}
                        disabled={saving || !canSave}
                        className={buttonClass + "bg-brand text-midnight-light hover:bg-brand-dark"}
                    >
                        {saving ? "Saving..." : "Save deck"}
                    </button>
                )}
            </div>

            {blockedReason && (
                <p className="text-sm text-amber-800 [overflow-wrap:anywhere]">{blockedReason}</p>
            )}

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
                            onClick={saving ? undefined : () => void saveAs(newName, true)}
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
    );
}
