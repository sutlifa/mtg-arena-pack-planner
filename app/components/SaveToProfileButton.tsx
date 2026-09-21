"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

/**
 * The Save to Profile control, split out of SideboardPlanner so that
 * `useSession` is only ever called where a SessionProvider exists.
 *
 * On a deployment without Google credentials the provider isn't mounted at
 * all (see Providers), and calling useSession without one throws during
 * prerendering — which broke the build the first time this lived inside the
 * planner. Keeping the hook in a component that is itself conditionally
 * rendered is what makes "auth is optional" actually hold.
 *
 * Naming happens in an inline form rather than window.prompt: the native
 * dialog is chrome, not page, so it looks like the browser asking rather than
 * the app, can't be styled, and on some platforms reads as a security prompt.
 * Inline also means it works inside the Start Over dialog without stacking a
 * browser modal on top of a page modal.
 *
 * Two modes, decided by `savedId`:
 *
 * - Nothing open — the button opens the name form and creates a guide.
 * - A guide open — the button updates THAT row by id and keeps its name, and
 *   "Save as new..." is the way to branch off a second guide. Before this
 *   existed, saving an edited guide meant retyping its exact name to hit the
 *   name-keyed upsert; a typo silently produced a duplicate instead of the
 *   overwrite the user asked for.
 */
export default function SaveToProfileButton({
    plan,
    format,
    formatLabel,
    savedId = null,
    savedName = null,
    label,
    allowSaveAsNew = true,
    onSaved,
}: {
    plan: unknown;
    format: string;
    formatLabel: string;
    /** The guide currently open in the planner, if any. */
    savedId?: number | null;
    savedName?: string | null;
    /** Override the button text — the clear dialog reuses this as "Save and clear". */
    label?: string;
    /** The clear dialog turns this off: branching a copy mid-reset is noise. */
    allowSaveAsNew?: boolean;
    /** Fires only after a save actually succeeds, with the row it wrote. */
    onSaved?: (saved: { id: number; name: string }) => void;
}) {
    const { data: session } = useSession();
    const [naming, setNaming] = useState(false);
    const [name, setName] = useState("");
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    if (!session?.user) {
        return (
            <a
                href="/signin?callbackUrl=%2Fsideboard"
                className="px-6 py-3 rounded shadow-card font-title text-xl bg-parchment text-ink hover:bg-parchment/70"
            >
                Sign in to Save
            </a>
        );
    }

    const startNaming = () => {
        // Branching off an open guide defaults to "<name> (copy)", the same
        // shape the Duplicate button produces, so the two routes to a second
        // guide don't leave differently-named results.
        setName(savedName ? `${savedName} (copy)` : `${formatLabel} sideboard guide`);
        setMessage(null);
        setNaming(true);
    };

    /** Creates a new guide from the inline name form. */
    const saveAsNew = async () => {
        if (!name.trim()) {
            setMessage("Give it a name.");
            return;
        }

        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch("/api/guides", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // The whole plan goes up as-is: it is the same object already
                // kept in localStorage, so a saved guide and a local one are
                // the same shape and load into the editor identically.
                body: JSON.stringify({ name: name.trim(), format, plan }),
            });
            const data = await res.json().catch(() => ({}));

            if (res.status === 401) {
                setMessage("Sign in first to save to your profile.");
            } else if (!res.ok) {
                setMessage(data.error ?? "Could not save that guide.");
            } else {
                setMessage(`Saved as "${data.name}".`);
                setNaming(false);
                onSaved?.({ id: data.id, name: data.name });
            }
        } catch {
            setMessage("Could not save that guide.");
        }
        setSaving(false);
    };

    /** Updates the open guide in place, keeping its name. */
    const saveOpen = async () => {
        if (savedId === null) return;

        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch(`/api/guides/${savedId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                // No name in the body: this is "save what I'm editing", and
                // omitting it tells the server to leave the name alone.
                body: JSON.stringify({ format, plan }),
            });
            const data = await res.json().catch(() => ({}));

            if (res.status === 401) {
                setMessage("Sign in first to save to your profile.");
            } else if (res.status === 404) {
                setMessage("That guide no longer exists — use “Save as new” to keep this.");
            } else if (!res.ok) {
                setMessage(data.error ?? "Could not save that guide.");
            } else {
                setMessage(`Saved "${data.name}".`);
                onSaved?.({ id: data.id, name: data.name });
            }
        } catch {
            setMessage("Could not save that guide.");
        }
        setSaving(false);
    };

    if (naming) {
        return (
            <div className="w-full max-w-md bg-parchment rounded shadow-inner-parchment p-4 space-y-3">
                <label className="block">
                    <span className="text-sm text-ink/70">Save this guide as</span>
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
                        placeholder={`${formatLabel} sideboard guide`}
                        className="mt-1 w-full px-3 py-2 rounded bg-parchment-dark text-ink shadow-inner-parchment"
                    />
                </label>

                <p className="text-xs text-ink/55">
                    {savedId === null
                        ? "Reusing a name updates that guide instead of making a second one."
                        : `This creates a second guide and leaves "${savedName}" as it was.`}
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
                        className={
                            "px-5 py-2 rounded font-title " +
                            (saving
                                ? "bg-gray-400 cursor-not-allowed text-midnight-light"
                                : "bg-brand text-midnight-light hover:bg-brand-dark")
                        }
                    >
                        {saving ? "Saving..." : "Save"}
                    </button>
                </div>
            </div>
        );
    }

    const open = savedId !== null;

    return (
        <>
            <button
                type="button"
                onClick={saving ? undefined : open ? saveOpen : startNaming}
                disabled={saving}
                className={
                    "px-6 py-3 rounded shadow-card font-title text-xl " +
                    (saving
                        ? "bg-gray-400 cursor-not-allowed text-midnight-light"
                        : "bg-brand text-midnight-light hover:bg-brand-dark")
                }
            >
                {saving ? "Saving..." : label ?? (open ? "Save" : "Save to Profile")}
            </button>

            {open && allowSaveAsNew && (
                <button
                    type="button"
                    onClick={saving ? undefined : startNaming}
                    disabled={saving}
                    className="px-5 py-3 rounded shadow-card font-title bg-parchment text-ink hover:bg-parchment/70 disabled:opacity-50"
                >
                    Save as new...
                </button>
            )}

            {open && savedName && (
                <p className="w-full text-sm text-center text-ink/70">
                    Editing &quot;{savedName}&quot;. Save updates that guide.
                </p>
            )}

            {message && (
                <p className="w-full text-sm text-center text-ink/80" role="status">
                    {message}
                </p>
            )}
        </>
    );
}
