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
 */
export default function SaveToProfileButton({
    plan,
    format,
    formatLabel,
    label = "Save to Profile",
    onSaved,
}: {
    plan: unknown;
    format: string;
    formatLabel: string;
    /** Override the button text — the clear dialog reuses this as "Save and clear". */
    label?: string;
    /** Fires only after a save actually succeeds. */
    onSaved?: () => void;
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
        setName(`${formatLabel} sideboard guide`);
        setMessage(null);
        setNaming(true);
    };

    const save = async () => {
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
                onSaved?.();
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
                                save();
                            }
                            if (e.key === "Escape") setNaming(false);
                        }}
                        placeholder={`${formatLabel} sideboard guide`}
                        className="mt-1 w-full px-3 py-2 rounded bg-parchment-dark text-ink shadow-inner-parchment"
                    />
                </label>

                <p className="text-xs text-ink/55">
                    Reusing a name updates that guide instead of making a second one.
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
                        onClick={saving ? undefined : save}
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

    return (
        <>
            <button
                type="button"
                onClick={startNaming}
                className="px-6 py-3 rounded shadow-card font-title text-xl bg-brand text-midnight-light hover:bg-brand-dark"
            >
                {label}
            </button>

            {message && (
                <p className="w-full text-sm text-center text-ink/80" role="status">
                    {message}
                </p>
            )}
        </>
    );
}
