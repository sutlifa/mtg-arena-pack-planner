"use client";

import { useState } from "react";

/**
 * The open guide's name, at the top of the Sideboard Planner, with a way to
 * rename it in place.
 *
 * Renaming used to mean "Save as new..." under a new name and then deleting
 * the old guide, or saving over it — both of which also committed whatever
 * was half-edited in the planner. This calls the rename-only PATCH, so the
 * name changes and the saved plan doesn't.
 *
 * Only rendered while a saved guide is open. No useSession here: the planner
 * only has a savedId after a signed-in save or load, and if the session has
 * since lapsed the server's 401 says so.
 */
export default function GuideNameBar({
    id,
    name,
    onRenamed,
}: {
    id: number;
    name: string;
    onRenamed: (name: string) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(name);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const start = () => {
        setDraft(name);
        setError(null);
        setEditing(true);
    };

    const rename = async () => {
        const next = draft.trim();
        if (!next) {
            setError("Give it a name.");
            return;
        }
        if (next === name) {
            setEditing(false);
            return;
        }

        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`/api/guides/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: next }),
            });
            const data = await res.json().catch(() => ({}));

            if (res.status === 401) {
                setError("Sign in again to rename this guide.");
            } else if (res.status === 404) {
                setError("That guide no longer exists.");
            } else if (!res.ok) {
                setError(data.error ?? "Could not rename that guide.");
            } else {
                onRenamed(data.name);
                setEditing(false);
            }
        } catch {
            setError("Could not rename that guide.");
        }
        setSaving(false);
    };

    return (
        <div className="bg-parchment-dark shadow-card rounded-lg px-4 py-3 sm:px-6 space-y-2">
            {editing ? (
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        type="text"
                        autoFocus
                        aria-label="Guide name"
                        value={draft}
                        maxLength={120}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                rename();
                            }
                            if (e.key === "Escape") setEditing(false);
                        }}
                        className="flex-1 min-w-0 basis-60 px-3 py-2 rounded bg-parchment text-ink font-title text-lg shadow-inner-parchment"
                    />
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setEditing(false)}
                            className="px-4 py-2 rounded text-sm text-ink/70 hover:bg-parchment"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={saving ? undefined : rename}
                            disabled={saving}
                            className={
                                "px-4 py-2 rounded font-title " +
                                (saving
                                    ? "bg-gray-400 cursor-not-allowed text-midnight-light"
                                    : "bg-brand text-midnight-light hover:bg-brand-dark")
                            }
                        >
                            {saving ? "Renaming..." : "Rename"}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wider text-ink/55">
                            Editing
                        </p>
                        <p className="font-title text-xl truncate" title={name}>
                            {name}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={start}
                        className="shrink-0 px-4 py-2 rounded text-sm font-title bg-parchment text-ink shadow-card hover:bg-parchment/70"
                    >
                        Rename
                    </button>
                </div>
            )}

            {error && (
                <p className="text-sm text-red-700" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}
