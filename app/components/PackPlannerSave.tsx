"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

/** A saved row the planner currently has open. */
export type SavedRef = { id: number; name: string; arena: boolean } | null;

export type SaveKind = "collection" | "comparison";

/**
 * Save the Pack Planner's inputs — one button, plus the inline name form it
 * opens when there is nothing to update.
 *
 * Split out of PackPlannerSaves so the Start Over dialog can offer "save and
 * clear" using the *same* save path as the buttons above it. The Sideboard
 * Planner already does exactly this with SaveToProfileButton; a second,
 * dialog-only implementation would be two places to fix every time a limit
 * or an error message changes.
 *
 * Only ever rendered where auth is configured: useSession throws without a
 * SessionProvider, and the provider isn't mounted on a deployment without
 * Google credentials (see Providers and lib/authConfig).
 *
 * When `open` is set the button updates that row by id and keeps its name.
 * POSTing instead would key the upsert on the name — so renaming, or
 * flipping a collection's mode, would leave the original behind and quietly
 * write a second row.
 */
export default function PackPlannerSave({
    kind,
    decks,
    collection,
    arenaMode,
    open,
    label,
    allowSaveAsNew = true,
    variant = "secondary",
    onSaved,
}: {
    kind: SaveKind;
    decks: string[];
    collection: string;
    /** The planner's current Arena/Paper toggle. */
    arenaMode: boolean;
    open: SavedRef;
    /** Override the button text — the Start Over dialog uses "Save and clear". */
    label?: string;
    allowSaveAsNew?: boolean;
    variant?: "primary" | "secondary";
    onSaved?: (saved: { id: number; name: string; arena: boolean; kind: SaveKind }) => void;
}) {
    const { data: session } = useSession();
    const [naming, setNaming] = useState(false);
    const [name, setName] = useState("");
    const [arena, setArena] = useState(arenaMode);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const isCollection = kind === "collection";
    const noun = isCollection ? "collection" : "comparison";
    const endpoint = isCollection ? "collections" : "analyses";

    if (!session?.user) {
        return (
            <a
                href="/signin?callbackUrl=%2Fplanner"
                className="px-5 py-2 rounded shadow-card font-title bg-parchment text-ink hover:bg-parchment/70"
            >
                Sign in to Save
            </a>
        );
    }

    /** What the user would lose, and therefore whether saving means anything. */
    const hasContent = isCollection ? Boolean(collection.trim()) : decks.some((d) => d.trim());

    const body = (saveName: string | null, saveArena: boolean) =>
        isCollection
            ? { ...(saveName === null ? {} : { name: saveName }), rawText: collection, arenaMode: saveArena }
            : {
                ...(saveName === null ? {} : { name: saveName }),
                decklists: decks,
                collection,
                arenaMode: saveArena,
            };

    const startNaming = () => {
        if (!hasContent) {
            setMessage(isCollection ? "Paste a collection first." : "Add at least one decklist first.");
            return;
        }
        setMessage(null);
        // Branching off an open save defaults to "<name> (copy)", matching
        // what the profile page's Duplicate button produces.
        setName(open ? `${open.name} (copy)` : "");
        // Defaults to the mode you're in, but stays changeable — you might be
        // pasting an Arena export while the toggle is still on Paper.
        setArena(isCollection && open ? open.arena : arenaMode);
        setNaming(true);
    };

    /** Creates a second, separate save from the inline name form. */
    const saveAsNew = async () => {
        if (!name.trim()) {
            setMessage("Give it a name.");
            return;
        }

        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch(`/api/${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body(name.trim(), arena)),
            });
            const data = await res.json().catch(() => ({}));

            if (res.status === 401) {
                setMessage("Sign in first to save to your profile.");
            } else if (!res.ok) {
                setMessage(data.error ?? `Could not save that ${noun}.`);
            } else {
                setMessage(`Saved "${data.name}" as ${arena ? "Arena" : "Paper"}.`);
                setNaming(false);
                onSaved?.({ id: data.id, name: data.name, arena, kind });
            }
        } catch {
            setMessage(`Could not save that ${noun}.`);
        }
        setSaving(false);
    };

    /** Updates the open row in place, keeping its name. */
    const saveOpen = async () => {
        if (!open) return;

        if (!hasContent) {
            setMessage(isCollection ? "Paste a collection first." : "Add at least one decklist first.");
            return;
        }

        // A collection's mode describes the list itself — an Arena export is
        // an Arena export whichever way the page toggle happens to be set —
        // so an in-place save keeps the mode it was filed under. A
        // comparison's mode is part of the comparison, so that one follows
        // the toggle.
        const saveArena = isCollection ? open.arena : arenaMode;

        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch(`/api/${endpoint}/${open.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                // No name in the body: the server reads that as "leave the
                // name alone", which is what Save means here.
                body: JSON.stringify(body(null, saveArena)),
            });
            const data = await res.json().catch(() => ({}));

            if (res.status === 401) {
                setMessage("Sign in first to save to your profile.");
            } else if (res.status === 404) {
                setMessage(`That ${noun} no longer exists — use "Save as new" to keep this.`);
            } else if (!res.ok) {
                setMessage(data.error ?? `Could not save that ${noun}.`);
            } else {
                setMessage(`Saved "${data.name}".`);
                onSaved?.({ id: data.id, name: data.name, arena: saveArena, kind });
            }
        } catch {
            setMessage(`Could not save that ${noun}.`);
        }
        setSaving(false);
    };

    if (naming) {
        return (
            <div className="bg-parchment rounded shadow-inner-parchment p-3 sm:p-4 space-y-3 max-w-lg w-full mx-auto text-left">
                <p className="font-title text-lg">Save {noun}</p>

                <label className="block">
                    <span className="text-sm text-ink/70">Name</span>
                    <input
                        type="text"
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                saveAsNew();
                            }
                            if (e.key === "Escape") setNaming(false);
                        }}
                        placeholder={
                            isCollection
                                ? arena
                                    ? "My Arena collection"
                                    : "My paper collection"
                                : "My comparison"
                        }
                        className="mt-1 w-full px-3 py-2 rounded bg-parchment-dark text-ink shadow-inner-parchment"
                    />
                </label>

                <div>
                    <span className="text-sm text-ink/70">Save as</span>
                    <div className="mt-1 flex gap-2">
                        {[
                            { label: "Arena", value: true },
                            { label: "Paper", value: false },
                        ].map((opt) => (
                            <button
                                key={opt.label}
                                type="button"
                                onClick={() => setArena(opt.value)}
                                aria-pressed={arena === opt.value}
                                className={
                                    "px-4 py-2 rounded font-title text-sm transition-colors " +
                                    (arena === opt.value
                                        ? "bg-brass text-brass-ink"
                                        : "bg-parchment-dark text-ink/70 hover:bg-parchment-dark/70")
                                }
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-ink/55 mt-1">
                        Loading it later puts the planner back into this mode.
                    </p>
                </div>

                <p className="text-xs text-ink/55">
                    {open
                        ? `This creates a second ${noun} and leaves "${open.name}" as it was.`
                        : `Reusing a name updates that ${noun} instead of making a second one.`}
                </p>

                {message && (
                    <p className="text-sm text-ink/80" role="status">
                        {message}
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
                        onClick={saving ? undefined : saveAsNew}
                        disabled={saving}
                        className="px-5 py-2 rounded font-title bg-brand text-midnight-light hover:bg-brand-dark disabled:opacity-50"
                    >
                        {saving ? "Saving..." : "Save"}
                    </button>
                </div>
            </div>
        );
    }

    const primaryClass =
        variant === "primary"
            ? "px-4 py-2 rounded font-title text-sm bg-brand text-midnight-light hover:bg-brand-dark disabled:opacity-50"
            : "px-5 py-2 rounded shadow-card font-title bg-parchment text-ink hover:bg-parchment/70 disabled:opacity-50";

    const secondaryClass =
        variant === "primary"
            ? "px-4 py-2 rounded font-title text-sm text-ink/70 hover:bg-parchment-dark disabled:opacity-50"
            : "px-5 py-2 rounded shadow-card font-title bg-parchment text-ink hover:bg-parchment/70 disabled:opacity-50";

    const defaultLabel = isCollection ? "Save Collection" : "Save Comparison";

    return (
        <>
            <button
                type="button"
                onClick={saving ? undefined : open ? saveOpen : startNaming}
                disabled={saving}
                className={primaryClass}
            >
                {saving ? "Saving..." : label ?? defaultLabel}
            </button>

            {open && allowSaveAsNew && (
                <button
                    type="button"
                    onClick={saving ? undefined : startNaming}
                    disabled={saving}
                    className={secondaryClass}
                >
                    Save as new...
                </button>
            )}

            {message && (
                <p className="w-full text-sm text-center text-ink/80" role="status">
                    {message}
                </p>
            )}
        </>
    );
}
